const { execFileSync } = require('node:child_process')
const { chmodSync, existsSync } = require('node:fs')
const { join } = require('node:path')

/**
 * Apple Silicon refuses to exec an arm64 binary whose signature does not check
 * out, and electron-builder rewrites Info.plist and renames the helpers, which
 * invalidates the ad-hoc signature Electron shipped with. Re-sign the whole
 * bundle ad-hoc (`-`) so the app can start. That takes a real `codesign`, so it
 * only happens on a macOS builder; a cross-build from Linux is left unsigned and
 * will be killed on launch.
 */
function adhocSign(app) {
  if (process.platform !== 'darwin') {
    console.warn(`[mxwl] not on macOS — ${app} is unsigned and will not run on Apple Silicon`)
    return
  }
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  // node-pty execs `spawn-helper` on macOS to open a tty. npm does not preserve the
  // executable bit on the published prebuilds, so it lands in the app as 0664 and
  // every terminal fails to spawn. Restore it before signing seals the tree.
  const prebuilds = join(
    app,
    'Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds'
  )
  for (const arch of ['darwin-arm64', 'darwin-x64']) {
    const helper = join(prebuilds, arch, 'spawn-helper')
    if (existsSync(helper)) chmodSync(helper, 0o755)
  }

  adhocSign(app)
}
