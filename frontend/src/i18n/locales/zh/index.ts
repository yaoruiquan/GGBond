import adminAccessKeys from './adminAccessKeys'
import mcp from './mcp'
import landing from './landing'
import common from './common'
import dashboard from './dashboard'
import channelMonitorV2 from './channelMonitorV2'
import batchImage from './batchImage'
import admin from './admin'
import misc from './misc'
import ggbond from './ggbond'
import homeGgbond from './home-ggbond'
import contactMethods from './contact-methods'

export default {
  contactMethods,
  adminAccessKeys,
  mcp,
  ...landing,
  ...common,
  ...dashboard,
  ...channelMonitorV2,
  ...batchImage,
  admin,
  ...misc,
  ggbond,
  // GGbond AI 首页用 home.* 命名空间：合并 landing.home 与 GGbond 文案。
  home: { ...landing.home, ...homeGgbond },
}
