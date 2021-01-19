import { download } from 'coc.nvim'
import fs from 'fs'
import mkdirp from 'mkdirp'
import path from 'path'

/**
 * Download and extract tgz from url
 */
export default async function downloadBinary(url: string, dest: string, onProgress: (percent: string) => void): Promise<void> {
  if (!dest || !path.isAbsolute(dest)) {
    throw new Error(`Expect absolute file path for dest option.`)
  }
  const folder = path.dirname(dest)
  if (!fs.existsSync(folder)) mkdirp.sync(folder)
  let filepath = await download(url, {
    dest: folder,
    onProgress: percent => {
      if (onProgress) onProgress(percent)
    },
    extract: false,
  })
  if (fs.existsSync(dest)) {
    fs.unlinkSync(dest)
  }
  fs.renameSync(filepath, dest)
}
