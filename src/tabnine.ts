import { Mutex } from 'await-semaphore'
import child_process from 'child_process'
import { fetch, window } from 'coc.nvim'
import fs from 'fs-extra'
import path from 'path'
import readline from 'readline'
import semver from 'semver'
import download from './download'

export class TabNine {
  private childDead: boolean
  private binaryPath?: string
  private mutex: Mutex = new Mutex()
  private numRestarts = 0
  private proc: child_process.ChildProcess
  private rl: readline.ReadLine

  constructor(private storagePath: string, binaryPath?: string) {
    this.binaryPath = binaryPath
  }

  public async request(version: string, any_request: any): Promise<any> {
    const release = await this.mutex.acquire()
    try {
      return await this.requestUnlocked(version, any_request)
    } finally {
      release()
    }
  }

  private requestUnlocked(version: string, any_request: any): Promise<any> {
    any_request = {
      version,
      request: any_request
    }
    const request = JSON.stringify(any_request) + '\n'
    return new Promise<any>((resolve, reject) => {
      try {
        if (!this.isChildAlive()) {
          this.restartChild()
        }
        if (!this.isChildAlive()) {
          reject(new Error("TabNine process is dead."))
        }
        this.rl.once('line', response => {
          let any_response: any = JSON.parse(response.toString())
          resolve(any_response)
        })
        this.proc.stdin.write(request, "utf8")
      } catch (e) {
        // tslint:disable-next-line: no-console
        console.log(`Error interacting with TabNine: ${e}`)
        reject(e)
      }
    })
  }

  private isChildAlive(): boolean {
    return this.proc && !this.childDead
  }

  private restartChild(): void {
    if (this.numRestarts >= 10) {
      return
    }
    this.numRestarts += 1
    if (this.proc) {
      this.proc.kill()
    }
    const args = [
      "--client=coc.nvim",
    ]

    const binaryPath = this.binaryPath || TabNine.getBinaryPath(path.join(this.storagePath, "binaries"))

    this.proc = child_process.spawn(binaryPath, args)
    this.childDead = false
    this.proc.on('exit', () => {
      this.childDead = true
    })
    this.proc.stdin.on('error', error => {
      // tslint:disable-next-line: no-console
      console.log(`stdin error: ${error}`)
      this.childDead = true
    })
    this.proc.stdout.on('error', error => {
      // tslint:disable-next-line: no-console
      console.log(`stdout error: ${error}`)
      this.childDead = true
    })
    this.proc.unref() // AIUI, this lets Node exit without waiting for the child
    this.rl = readline.createInterface({
      input: this.proc.stdout,
      output: this.proc.stdin
    })
  }

  // install if not exists
  public static async installTabNine(root: string): Promise<void> {
    const version = (await fetch('https://update.tabnine.com/bundles/version')).toString().trim()
    const archAndPlatform = TabNine.getArchAndPlatform()
    // https://update.tabnine.com/bundles/3.3.34/x86_64-apple-darwin/TabNine.zip
    const url = `https://update.tabnine.com/bundles/${version}/${archAndPlatform}/TabNine.zip`
    const item = window.createStatusBarItem(0, { progress: true })

    item.text = 'Downloading TabNine'
    item.show()
    const files = ['TabNine', 'TabNine-deep-cloud', 'TabNine-deep-local', 'WD-TabNine']
    try {
      const dest = path.join(root, `${version}/${archAndPlatform}`)
      await download(url, dest, percent => {
        item.text = `Downloading TabNine ${percent}%`
      })
      for (let file of files) {
        if (process.platform == 'win32') file = file + '.exe'
        let fullpath = path.join(dest, file)
        if (fs.existsSync(fullpath)) {
          fs.chmodSync(fullpath, 0o755)
        }
      }
    } catch (e) {
      window.showMessage(`Download error ${e.message}`, 'error')
    }
    item.dispose()
  }

  public static async updateTabNine(root: string): Promise<void> {
    const version = (await fetch('https://update.tabnine.com/bundles/version')).toString().trim()
    const archAndPlatform = TabNine.getArchAndPlatform()
    const fullpath = path.join(root, `${version}/${archAndPlatform}`, `TabNine${process.platform == 'win32' ? '.exe' : ''}`)
    if (fs.existsSync(fullpath)) {
      let force = await window.showPrompt(`Latest version ${version} already exists, force update?`)
      if (!force) return
      fs.emptyDirSync(path.dirname(fullpath))
    }
    await TabNine.installTabNine(root)
  }


  public static getBinaryPath(root: string): string {
    const archAndPlatform = TabNine.getArchAndPlatform()
    const versions = fs.readdirSync(root)

    if (!versions || versions.length == 0) {
      throw new Error('TabNine not installed')
    }

    const sortedVersions = TabNine.sortBySemver(versions)

    const tried = []
    for (const version of sortedVersions) {
      const fullPath = path.join(root, `${version}/${archAndPlatform}`, process.platform == 'win32' ? 'TabNine.exe' : 'TabNine')
      if (fs.existsSync(fullPath)) {
        return fullPath
      } else {
        tried.push(fullPath)
      }
    }
    throw new Error(`Couldn't find a TabNine binary (tried the following paths: versions=${sortedVersions} ${tried})`)
  }

  private static getArchAndPlatform(): string {
    let arch: string
    switch (process.arch) {
      case 'x32':
        arch = 'i686'
        break
      case 'x64':
        arch = 'x86_64'
        break
      case 'arm64':
        arch = 'aarch64'
        break
      default:
        throw new Error(`Sorry, the architecture '${process.arch}' is not supported by TabNine.`)
    }

    let suffix: string
    switch (process.platform) {
      case 'win32':
        suffix = 'pc-windows-gnu'
        break
      case 'darwin':
        suffix = 'apple-darwin'
        break
      case 'freebsd':
      case 'linux':
        suffix = 'unknown-linux-musl'
        break
      default:
        throw new Error(`Sorry, the platform '${process.platform}' is not supported by TabNine.`)
    }

    return `${arch}-${suffix}`
  }

  private static sortBySemver(versions: string[]): string[] {
    return versions.sort(TabNine.cmpSemver)
  }

  private static cmpSemver(a: string, b: string): number {
    const a_valid = semver.valid(a)
    const b_valid = semver.valid(b)
    if (a_valid && b_valid) { return semver.rcompare(a, b) }
    else if (a_valid) { return -1 }
    else if (b_valid) { return 1 }
    else if (a < b) { return -1 }
    else if (a > b) { return 1 }
    else { return 0 }
  }
}
