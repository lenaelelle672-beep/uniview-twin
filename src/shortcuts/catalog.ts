export type ShortcutRow = {
  keys: string
  action: string
}

export type ShortcutGroup = {
  id: string
  title: string
  rows: ShortcutRow[]
}

/**
 * 已有能力的速查，不新造行走键。
 * 镜头仍用现有轨道控制（左键旋转、右键平移、滚轮缩放）。
 */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'sheet',
    title: '速查',
    rows: [
      { keys: '?', action: '打开或关闭本面板' },
      { keys: 'Esc', action: '关闭本面板。和搜索、抽屉、测距、导览共用同一条 Esc 栈，先关最上层' },
    ],
  },
  {
    id: 'scene',
    title: '场景',
    rows: [
      { keys: 'Esc', action: '没有浮层时，单层视图返回总览' },
      { keys: '鼠标', action: '左键旋转，右键平移，滚轮缩放。不接 WASD 漫游' },
    ],
  },
  {
    id: 'search',
    title: '搜索',
    rows: [
      { keys: '↑ ↓', action: '在搜索结果里移动' },
      { keys: 'Enter', action: '打开当前工位' },
      { keys: 'Esc', action: '先关列表，再清空，再离开搜索框' },
    ],
  },
  {
    id: 'layers',
    title: '图层',
    rows: [{ keys: '点按', action: '分别开关人流、标签、热力、描边、圆标' }],
  },
  {
    id: 'measure',
    title: '测距',
    rows: [
      { keys: '点按', action: '在场景上点两点，显示直线距离' },
      { keys: 'Esc', action: '退出测距' },
    ],
  },
  {
    id: 'minimap',
    title: '小地图',
    rows: [{ keys: '点按', action: '单层视图里点击平面图，镜头飞到该处' }],
  },
  {
    id: 'bookmarks',
    title: '书签',
    rows: [
      { keys: '点按', action: '保存当前视角、复制链接，或开始告警楼层导览' },
      { keys: 'Esc', action: '停止导览' },
    ],
  },
  {
    id: 'fullscreen',
    title: '全屏',
    rows: [
      { keys: 'F', action: '进入或退出画面全屏。优先画布区域' },
      { keys: 'Esc', action: '退出全屏，沿用浏览器默认，不经过本页的 Esc 栈' },
    ],
  },
  {
    id: 'alarm',
    title: '告警',
    rows: [
      { keys: '点按', action: '打开告警抽屉' },
      { keys: 'Esc', action: '关闭告警抽屉' },
    ],
  },
]
