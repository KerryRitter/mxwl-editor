const { execFileSync } = require('node:child_process')
const { mkdtempSync, copyFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { appBuilderPath } = require('app-builder-bin')

// Export platform formats from the checked-in generated PNG. No image service
// or additional image-conversion dependencies are needed for subsequent builds.
const root = resolve(__dirname, '..', 'resources')
const scratch = mkdtempSync(join(tmpdir(), 'mxwl-icons-'))
function convert(format, input, output) {
  const result = JSON.parse(execFileSync(appBuilderPath, [
    'icon', '--format', format, '--root', root, '--input', input, '--out', output
  ], { encoding: 'utf8' }))
  if (result.error || !result.icons?.length) throw new Error(result.error || 'No icons generated')
  return result.icons
}
try {
  copyFileSync(convert('icns', 'icon.png', scratch)[0].file, join(root, 'icon.icns'))
  copyFileSync(convert('ico', 'icon.png', scratch)[0].file, join(root, 'icon.ico'))
  const icons = convert('set', 'icon.icns', join(root, 'icons'))
  console.log(`Exported macOS/Windows icons and ${icons.length} Linux PNG sizes.`)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
