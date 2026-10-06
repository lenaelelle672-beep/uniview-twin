import { disableTroikaCdnFallback } from './disableTroikaCdn'

disableTroikaCdnFallback()

/** D109：troika 的独立按需包。只从房间标签动态引入。创建 Text / BatchedText 前必须先关 CDN。 */
export { Text } from '@react-three/drei/core/Text'
export { ProgressiveRoomLabels as BatchedRoomLabels } from '../labels/ProgressiveRoomLabels'
