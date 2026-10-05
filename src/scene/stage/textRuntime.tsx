import { Text } from '@react-three/drei/core/Text'
import { disableTroikaCdnFallback } from './disableTroikaCdn'

disableTroikaCdnFallback()

/** D109：drei Text 与其依赖的独立按需包。只从房间标签动态引入。 */
export { Text }
