import guideData from './guides.json';

export const product = {
  name: 'mxwl',
  version: '0.2.0-alpha.5',
  repository: 'https://github.com/KerryRitter/mxwl-editor',
  installer:
    'curl -fsSL https://raw.githubusercontent.com/KerryRitter/mxwl-editor/main/scripts/install.sh | bash',
  get release() {
    return `${this.repository}/releases/tag/v${this.version}`;
  },
  get downloads() {
    return `${this.repository}/releases/download/v${this.version}`;
  },
};

export const guides = guideData;
