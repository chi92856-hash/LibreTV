import path from 'path';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { pipeline } from 'node:stream/promises';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';

const config = {
  port: process.env.PORT || 8080,
  password: process.env.PASSWORD || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  timeout: parseInt(process.env.REQUEST_TIMEOUT || '5000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '2'),
  cacheMaxAge: process.env.CACHE_MAX_AGE || '1d',
  userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  debug: process.env.DEBUG === 'true'
};

const log = (...args) => {
  if (config.debug) {
    console.log('[DEBUG]', ...args);
  }
};

const app = express();
const assetVersions = new Map();

function assetVersion(filePath) {
  const stat = fs.statSync(filePath);
  const cached = assetVersions.get(filePath);
  if (cached?.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.version;
  const version = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
  assetVersions.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, version });
  return version;
}

function versionPageAssets(content) {
  return content.replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=)(["'])([^"']+)\2/gi,
    (match, prefix, quote, asset) => {
      const pathname = asset.split(/[?#]/)[0];
      if (!/^\/?(?:js|css|libs)\/.+\.(?:js|css)$/i.test(pathname)) return match;
      const filePath = path.resolve(__dirname, pathname.replace(/^\//, ''));
      if (!filePath.startsWith(__dirname + path.sep) || !fs.existsSync(filePath)) return match;
      const url = new URL(asset, 'http://localhost/');
      url.searchParams.set('v', assetVersion(filePath));
      const assetPath = asset.startsWith('/') ? url.pathname : url.pathname.slice(1);
      return prefix + quote + assetPath + url.search + url.hash + quote;
    });
}

app.use(cors({
  origin: config.corsOrigin,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

function sha256Hash(input) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    hash.update(input);
    resolve(hash.digest('hex'));
  });
}

async function renderPage(filePath, password) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (password !== '') {
    const sha256 = await sha256Hash(password);
    content = content.replace('{{PASSWORD}}', sha256);
  } else {
    content = content.replace('{{PASSWORD}}', '');
  }
  return versionPageAssets(content);
}

app.get(['/', '/index.html', '/player.html', '/watch.html', '/about.html'], async (req, res) => {
  try {
    let filePath;
    switch (req.path) {
      case '/player.html':
      case '/watch.html':
      case '/about.html':
        filePath = path.join(__dirname, req.path.slice(1));
        break;
      default: // '/' 和 '/index.html'
        filePath = path.join(__dirname, 'index.html');
        break;
    }
    
    const content = await renderPage(filePath, config.password);
    res.set('Cache-Control', 'no-store').send(content);
  } catch (error) {
    console.error('页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

app.get('/s=:keyword', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    const content = await renderPage(filePath, config.password);
    res.set('Cache-Control', 'no-store').send(content);
  } catch (error) {
    console.error('搜索页面渲染错误:', error);
    res.status(500).send('读取静态页面失败');
  }
});

function isValidUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const allowedProtocols = ['http:', 'https:'];
    
    // 从环境变量获取阻止的主机名列表
    const blockedHostnames = (process.env.BLOCKED_HOSTS || 'localhost,127.0.0.1,0.0.0.0,::1').split(',');
    
    // 从环境变量获取阻止的 IP 前缀
    const blockedPrefixes = (process.env.BLOCKED_IP_PREFIXES || '192.168.,10.,172.').split(',');
    
    if (!allowedProtocols.includes(parsed.protocol)) return false;
    if (blockedHostnames.includes(parsed.hostname)) return false;
    
    for (const prefix of blockedPrefixes) {
      if (parsed.hostname.startsWith(prefix)) return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// 验证代理请求的鉴权
function validateProxyAuth(req) {
  const authHash = req.query.auth;
  const timestamp = req.query.t;
  
  // 获取服务器端密码哈希
  const serverPassword = config.password;
  if (!serverPassword) {
    console.error('服务器未设置 PASSWORD 环境变量，代理访问被拒绝');
    return false;
  }
  
  // 使用 crypto 模块计算 SHA-256 哈希
  const serverPasswordHash = crypto.createHash('sha256').update(serverPassword).digest('hex');
  
  if (!authHash || authHash !== serverPasswordHash) {
    console.warn('代理请求鉴权失败：密码哈希不匹配');
    // Do not log password-derived authentication tokens.
    return false;
  }
  
  // 验证时间戳（10分钟有效期）
  if (timestamp) {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10分钟
    if (now - parseInt(timestamp) > maxAge) {
      console.warn('代理请求鉴权失败：时间戳过期');
      return false;
    }
  }
  
  return true;
}

app.get('/proxy/:encodedUrl', async (req, res) => {
  const controller = new AbortController();
  const abortUpstream = () => { if (!res.writableFinished) controller.abort(); };
  res.once('close', abortUpstream);
  try {
    // 验证鉴权
    if (!validateProxyAuth(req)) {
      return res.status(401).json({
        success: false,
        error: '代理访问未授权：请检查密码配置或鉴权参数'
      });
    }

    const encodedUrl = req.params.encodedUrl;
    const targetUrl = decodeURIComponent(encodedUrl);

    // 安全验证
    if (!isValidUrl(targetUrl)) {
      return res.status(400).send('无效的 URL');
    }

    log(`代理请求: ${targetUrl}`);

    // 添加请求超时和重试逻辑
    const maxRetries = config.maxRetries;
    let retries = 0;
    
    const makeRequest = async () => {
      try {
        return await axios({
          method: 'get',
          url: targetUrl,
          responseType: 'stream',
          signal: controller.signal,
          timeout: config.timeout,
          headers: {
            'User-Agent': config.userAgent,
            ...(/(^|\.)doubanio\.com$/i.test(new URL(targetUrl).hostname)
              ? { Referer: 'https://movie.douban.com/' } : {})
          }
        });
      } catch (error) {
        const status = error.response?.status;
        const transient = status ? [408, 429, 500, 502, 503, 504].includes(status) : ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN'].includes(error.code);
        if (!controller.signal.aborted && transient && retries < maxRetries) {
          error.response?.data?.destroy();
          retries++;
          log(`重试请求 (${retries}/${maxRetries}): ${targetUrl}`);
          return makeRequest();
        }
        throw error;
      }
    };

    let response;
    try {
      response = await makeRequest();
    } catch (error) {
      // Final upstream HTTP errors still have a body that must be streamed safely.
      if (!error.response) throw error;
      response = error.response;
    }

    // 转发响应头（过滤敏感头）
    const headers = { ...response.headers };
    const sensitiveHeaders = (
      process.env.FILTERED_HEADERS || 
      'content-security-policy,cookie,set-cookie,x-frame-options,access-control-allow-origin'
    ).split(',');
    
    sensitiveHeaders.forEach(header => delete headers[header]);
    res.status(response.status).set(headers);

    // pipeline closes both sides on a broken stream or client disconnect.
    await pipeline(response.data, res);
  } catch (error) {
    if (error.name !== 'AbortError' && error.code !== 'ERR_CANCELED' && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      console.error('代理请求错误:', error.message);
    }
    if (controller.signal.aborted || res.destroyed) return;
    if (res.headersSent) return res.destroy();
    res.status(502).send('代理请求失败，请稍后重试');
  } finally {
    res.off('close', abortUpstream);
  }
});

app.use(express.static(path.join(__dirname), {
  maxAge: isProduction ? config.cacheMaxAge : 0,
  immutable: isProduction,
  setHeaders(res, filePath) {
    if (!isProduction || path.extname(filePath) === '.html') {
      res.setHeader('Cache-Control', 'no-store');
    } else if (!/\.(?:js|css)$/i.test(filePath) || res.req.query.v !== assetVersion(filePath)) {
      // Only content-versioned URLs may be reused without checking the server.
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).send('服务器内部错误');
});

app.use((req, res) => {
  res.status(404).send('页面未找到');
});

// 启动服务器
export const server = await new Promise((resolve, reject) => {
  const listener = app.listen(config.port, process.env.HOST || '127.0.0.1');
  listener.once('error', reject);
  listener.once('listening', () => {
    listener.off('error', reject);
    resolve(listener);
  });
});

console.log(`服务器运行在 http://localhost:${server.address().port}`);
if (config.password !== '') {
  console.log('用户登录密码已设置');
} else {
  console.log('警告: 未设置 PASSWORD 环境变量，用户将被要求设置密码');
}
if (config.debug) {
  console.log('调试模式已启用');
  console.log('配置:', { ...config, password: config.password ? '******' : '' });
}
