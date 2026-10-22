// Лесные районы (демо, сверить с Приказом Минприроды России от 18.08.2014 № 367).
import type { ForestDistrict } from './types'

export const DISTRICTS: ForestDistrict[] = [
  { id: 'north_taiga_eu', nameRu: 'Северо-таежный район европейской части РФ', zone: 'taiga' },
  { id: 'middle_taiga_eu', nameRu: 'Среднетаежный район европейской части РФ', zone: 'taiga' },
  { id: 'south_taiga_eu', nameRu: 'Южно-таежный район европейской части РФ', zone: 'taiga' },
  { id: 'mixed_eu', nameRu: 'Район хвойно-широколиственных (смешанных) лесов европейской части РФ', zone: 'mixed' },
  { id: 'forest_steppe_eu', nameRu: 'Лесостепной район европейской части РФ', zone: 'forest_steppe' },
  { id: 'west_ural_taiga', nameRu: 'Западно-Уральский таежный район', zone: 'taiga' },
  { id: 'east_ural_taiga', nameRu: 'Восточно-Уральский таежный район', zone: 'taiga' },
  { id: 'wsib_middle_taiga', nameRu: 'Западно-Сибирский среднетаежный равнинный район', zone: 'taiga' },
  { id: 'wsib_south_taiga', nameRu: 'Западно-Сибирский южно-таежный равнинный район', zone: 'taiga' },
  { id: 'wsib_subtaiga_steppe', nameRu: 'Западно-Сибирский подтаежно-лесостепной район', zone: 'forest_steppe' },
  { id: 'csib_plateau_taiga', nameRu: 'Среднесибирский плоскогорный таежный район', zone: 'taiga' },
  { id: 'csib_subtaiga_steppe', nameRu: 'Среднесибирский подтаежно-лесостепной район', zone: 'forest_steppe' },
  { id: 'altai_sayan_mountain_taiga', nameRu: 'Алтае-Саянский горно-таежный район', zone: 'south_siberian_mountain' },
  { id: 'baikal_mountain', nameRu: 'Байкальский горный лесной район', zone: 'south_siberian_mountain' },
  { id: 'transbaikal_permafrost_taiga', nameRu: 'Забайкальский мерзлотный таежный район', zone: 'taiga' },
  { id: 'esib_permafrost_taiga', nameRu: 'Восточно-Сибирский мерзлотный таежный район', zone: 'taiga' },
  { id: 'far_east_taiga', nameRu: 'Дальневосточный таежный район', zone: 'taiga' },
  { id: 'amur_primorye_mixed', nameRu: 'Приамурско-Приморский хвойно-широколиственный район', zone: 'mixed' },
]

export const DISTRICT_BY_ID: Record<string, ForestDistrict> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, d]),
)
