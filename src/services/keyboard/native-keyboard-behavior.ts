const FORM_CONTROL_SELECTOR = 'input, textarea, select';
const NATIVE_ACTIVATION_SELECTOR = 'button, a[href], summary';

function eventTargets(event: KeyboardEvent): EventTarget[] {
  const path = event.composedPath();
  return path.length > 0 ? path : event.target ? [event.target] : [];
}

function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' ' || event.code === 'Space';
}

export function shouldPreserveNativeKeyboardBehavior(event: KeyboardEvent): boolean {
  const activationKey = isActivationKey(event);

  for (const target of eventTargets(event)) {
    if (!(target instanceof Element)) continue;

    if (target.matches(FORM_CONTROL_SELECTOR)) return true;
    if (target instanceof HTMLElement && target.isContentEditable) return true;
    if (activationKey && target.matches(NATIVE_ACTIVATION_SELECTOR)) return true;
  }

  return false;
}
