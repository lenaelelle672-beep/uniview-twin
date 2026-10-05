/** 楼体、树和未选中的外壳用默认 0。数字必须大于底板，告警必须大于数字。 */
export const BADGE_PLATE_ORDER = 10
export const BADGE_DIGIT_ORDER = BADGE_PLATE_ORDER + 1
/** 告警标记（红底色块和上面的告警数字，以及单层里的告警工位屏幕）。 */
export const ALARM_MARKER_ORDER = BADGE_DIGIT_ORDER + 1
/** 低于底板。选中高亮先画，徽标再盖在上面，徽标以外仍能看见高亮。 */
export const BUILDING_HIGHLIGHT_ORDER = BADGE_PLATE_ORDER - 1
/** 告警屏单独一层，合成器和主相机默认层看不到，避免 N8AO/AgX 按楼层压暗。 */
export const MONITOR_LAYER = 2
