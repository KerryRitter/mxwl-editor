import { registerHandler } from '../ipc'
import type { ControlServer } from './ControlServer'

export { ControlServer } from './ControlServer'
export { runControlCli, isControlCli } from './cli'

export function registerControlIpc(control: ControlServer): void {
  registerHandler('control:status', () => control.status())
  registerHandler('control:fleet', () => control.fleet())
}
