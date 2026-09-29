/** 楼体、树和未选中的外壳用默认 0。数字必须大于底板，告警必须大于数字。 */
export const BADGE_PLATE_ORDER = 10
export const BADGE_DIGIT_ORDER = BADGE_PLATE_ORDER + 1
/** 告警标记（红底色块和上面的告警数字，以及单层里的告警工位屏幕）。 */
export const ALARM_MARKER_ORDER = BADGE_DIGIT_ORDER + 1
/** 高于徽标的底板、色块、数字和告警标记，选中高亮不会被徽标盖住。 */
export const BUILDING_HIGHLIGHT_ORDER = ALARM_MARKER_ORDER + 1
