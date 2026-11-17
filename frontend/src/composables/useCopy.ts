import { onScopeDispose, ref } from 'vue'

/**
 * Copy text to the clipboard. Falls back to a hidden textarea where the async
 * Clipboard API is missing or refused. Returns whether the copy worked.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* refused (permissions, insecure context): try the legacy path */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy')
    document.body.removeChild(area)
    return copied
  } catch {
    return false
  }
}

/**
 * A copy action with feedback. When the browser refuses, `manualText` holds
 * the text so the page can show it for manual copying.
 */
export function useCopy() {
  const feedback = ref('')
  const manualText = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(text: string, done = 'Copied'): Promise<boolean> {
    if (timer) clearTimeout(timer)
    manualText.value = ''
    const copied = await copyText(text)
    if (copied) {
      feedback.value = done
      timer = setTimeout(() => {
        feedback.value = ''
      }, 3000)
    } else {
      feedback.value = 'Your browser blocked the copy. Select the text below and copy it manually.'
      manualText.value = text
    }
    return copied
  }

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return { copy, feedback, manualText }
}
