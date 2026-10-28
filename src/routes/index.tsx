import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  getVerifiedDisplayMenu,
  quotePublishedPack,
  quotePublishedSchmear,
  quoteTwoBagelCombo,
  canProceedToCheckout,
  type BagelSelection,
  type BagelFormat,
  type PackMix,
  type ShopQuote,
} from '../domain/lib/approved-shop-contract'
import type { BatchAvailability } from '../domain/lib/batch-types'

export const Route = createFileRoute('/')({ component: BagelitoStore })

type Category = 'packs' | 'combos' | 'schmears'
type Stage = 'entry' | 'category' | 'configure'

const menu = getVerifiedDisplayMenu()
const firstFlavor = menu.bagels[0]?.id ?? 'plain'
const secondFlavor = menu.bagels[1]?.id ?? firstFlavor
const firstSchmear = menu.schmears[0]?.id ?? 'whipped-original'
const localProductImage = (url: string) => url.replace('https://bagelito.pe', '')

function BagelitoStore() {
  const [stage, setStage] = useState<Stage>('category')
  const [category, setCategory] = useState<Category | null>(null)
  const [format, setFormat] = useState<BagelFormat | null>(null)
  const [quantity, setQuantity] = useState(6)
  const [mix, setMix] = useState<PackMix>('mixed')
  const [packCounts, setPackCounts] = useState<Record<string, number>>({})
  const [comboPicked, setComboPicked] = useState<[string | null, string | null]>([null, null])
  const [schmearId, setSchmearId] = useState(firstSchmear)
  const [schmearGrams, setSchmearGrams] = useState(120)¶»§q«^