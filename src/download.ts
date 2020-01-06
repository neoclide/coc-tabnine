import fs from 'fs'
import mkdirp from 'mkdirp'
import path from 'path'
import tunnel from 'tunnel'
import rimraf from 'rimraf'
import { Agent, RequestOptions } from 'http'
import { http, https } from 'follow-redirects'
import { parse } from 'url'
import { workspace } from 'coc.nvim'

export function getAgent(protocol: string): Agent {
  let proxy = workspace.getConfiguration('http').get<string>('proxy', '')
  let key = protocol.startsWith('https') ? 'HTTPS_PROXY' : 'HTTP_PROXY'
  if (!proxy && process.env[key]) {
    proxy = process.env[key].replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
  if (proxy) {
    let auth = proxy.includes('@') ? proxy.split('@', 2)[0] : ''
    let parts = auth.length ? proxy.slice(auth.length + 1).split(':') : proxy.split(':')
    if (parts.length > 1) {
      let agent = tunnel.httpsOverHttp({
        proxy: {
          headers: {},
          host: parts[0],
          port: parseInt(parts[1], 10),
          proxyAuth: auth
        }
      })
      return agent
    }
  }
}

/**
 * Download and extract tgz from url
 */
export default function download(url: string, dest: string, onProgress: (msg: number) => void): Promise<void> {
  if (!dest || !path.isAbsolute(dest)) {
    throw new Error(`Expect absolute file path for dest option.`)
  }

  const folder = path.dirname(dest)
  const endpoint = parse(url)
  const mod = url.startsWith('https') ? https : http
  const agent = getAgent(endpoint.protocol)
  const opts: RequestOptions = {
    method: 'GET',
    hostname: endpoint.hostname,
    port: endpoint.port ? parseInt(endpoint.port, 10) : endpoint.protocol === 'https:' ? 443 : 80,
    path: endpoint.path,
    protocol: url.startsWith('https') ? 'https:' : 'http:',
    agent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
      'Accept-Encoding': 'gzip',
    },
  }

  if (!fs.existsSync(folder)) mkdirp.sync(folder)

  return new Promise<void>((resolve, reject) => {
    const req = mod.request(opts, res => {
      if (res.statusCode != 200) {
        reject(new Error(`Invalid response from ${url}: ${res.statusCode}`))
        return
      }
      if (onProgress != null) {
        const contentLength = parseInt(res.headers['content-length'], 10)
        let current = 0
        if (!isNaN(contentLength)) {
          res.on('data', chunk => {
            current += chunk.length
            onProgress(current / contentLength)
          })
        }
      }

      const stream = res.pipe(fs.createWriteStream(dest))
      stream.on('finish', resolve)
    })
    req.on('error', reject)
    req.end()
  }).catch((err) => {
    // Cleanup after failed download.
    rimraf.sync(path.resolve(folder, '..'))
    throw err
  })
}
