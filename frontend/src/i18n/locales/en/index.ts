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

export default {
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
  // GGbond AI home uses home.* namespace: merge landing.home with GGbond copy
  home: { ...landing.home, ...homeGgbond },
}
