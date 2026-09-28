import { eastUpperOutline, podiumOutline } from '../src/scene/massing'
import { plazaPage, podiumPage, towerPage } from '../src/scene/plan'
import { FOOTPRINT_PAGE, worldToPage } from '../src/scene/scale'
import { PARCEL_PAGE, TOWER } from '../src/scene/siteGeometry'

const eastDrawing: Array<[number, number]> = [
  [FOOTPRINT_PAGE.west, FOOTPRINT_PAGE.north],
  [FOOTPRINT_PAGE.east, FOOTPRINT_PAGE.north],
  [FOOTPRINT_PAGE.east, FOOTPRINT_PAGE.south],
  [FOOTPRINT_PAGE.west, FOOTPRINT_PAGE.south],
]

const outlines = {
  parcel: PARCEL_PAGE,
  masses: {
    tower: {
      drawing: towerPage(),
      scene: [
        worldToPage(TOWER.minX, TOWER.minZ),
        worldToPage(TOWER.maxX, TOWER.minZ),
        worldToPage(TOWER.maxX, TOWER.maxZ),
        worldToPage(TOWER.minX, TOWER.maxZ),
      ],
    },
    east: {
      drawing: eastDrawing,
      scene: eastUpperOutline().map(([x, z]) => worldToPage(x, z)),
    },
    plaza: {
      drawing: plazaPage(),
      scene: plazaPage(),
    },
    podium: {
      drawing: podiumPage(),
      scene: podiumOutline().map(([x, z]) => worldToPage(x, z)),
    },
  },
}

process.stdout.write(JSON.stringify(outlines))
