import { download } from 'coc.nvim'
import fs from 'fs-extra'
import path from 'path'

/**
 * Download and extract tgz from url
 */
export default async function downloadBinary(url: string, dest: string, onProgress: (percent: string) => void): Promise<void> {
  if (!dest || !path.isAbsolute(dest)) {
    throw new Error(`Expect absolute file path for dest option.`)
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirpSync(dest)
  }
  await download(url, {
    dest,
    onProgress: percent => {
      if (onProgress) onProgress(percent)
    },
    extract: 'unzip',
  })
}
