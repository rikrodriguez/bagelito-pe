import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, PerformanceMonitor, RoundedBox } from '@react-three/drei'
import { Physics, CuboidCollider, RigidBody } from '@react-three/rapier'
import { Ecctrl, type EcctrlHandle } from 'ecctrl'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { getVerifiedDisplayMenu } from '../domain/lib/approved-shop-contract'
import './playable.css'

const BLUE = '#004aad'
const CORAL = '#fa967f'
const menu = getVerifiedDisplayMenu()
const combos = menu.historicalPublishedCombos

type Category = 'packs' | 'combos' | 'schmears'
type Step = 'explore' | 'choose-pack' | 'choose-combo' | 'choose-schmear-size' | 'bagels' | 'schmears' | 'cashier'
type Vec3 = [number, number, number]
type MoveInput = { forward: boolean; backward: boolean; left: boolean; right: boolean; run: boolean }

const ZONES = {
  totem: new THREE.Vector3(-3.2, 0, 6.2),
  vitrina: new THREE.Vector3(0, 0, 0.4),
  schmears: new THREE.Vector3(5.0, 0, -0.6),
  cashier: new THREE.Vector3(5.4, 0, 4.2),
} as const

export function PlayableStore() {
  const [mounted, setMounted] = useState(false)
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [player, setPlayer] = useState(new THREE.Vector3(0, 0, 7.3))
  const [category, setCategory] = useState<Category | null>(null)
  const [step, setStep] = useState<Step>('explore')
  const [packFormat, setPackForma¶»§q«^