/** Local keyboard isolation for the reference storefront's modal drawers.
 * No selection, order, storage or payment state is read or changed here.
 */
export function containReferenceDrawerFocus(root: HTMLElement, panel: HTMLElement, trigger: HTMLElement | null) {
  const doc = panel.ownerDocument
  const background = Array.from(root.children)
    .filter((element) => element !== panel && !element.classList.contains('guided-overlay-dismiss')) as HTMLElement[]
  const previousInert = background.map((element) => ({element, inert: element.inert}))
  for (const {element} of previousInert) element.inert = true

  const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]'))
    .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled')
      && element.getClientRects().length > 0 && doc.defaultView?.getComputedStyle(element).visibility !== 'hidden')
  const focus = (element: HTMLElement) => element.focus({preventScroll: true})
  focus(focusable()[0] ?? panel)

  const handleTab = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    const controls = focusable()
    if (!controls.length) { event.preventDefault(); focus(panel); return }
    const first = controls[0], last = controls[controls.length - 1]
    if (!panel.contains(doc.activeElement) || doc.activeElement === panel) {
      event.preventDefault(); focus(event.shiftKey ? last : first)
    } else if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault(); focus(last)
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault(); focus(first)
    }
  }
  doc.addEventListener('keydown', handleTab)
  return () => {
    doc.removeEventListener('keydown', handleTab)
    for (const {element, inert} of previousInert) element.inert = inert
    if (trigger?.isConnected && !trigger.closest('[inert]')) focus(trigger)
  }
}
