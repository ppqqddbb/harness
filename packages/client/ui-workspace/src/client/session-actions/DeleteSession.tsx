/** Permanent Session deletion as a danger-styled row-menu entry. */
import { IconTrashOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeleteSessionInjected, SessionMenuItemProps } from '../contract/slots.ts'

/**
 * Menu row (order 500): permanently delete the Session.
 * @param props - owner share, the delete behavior, and the menu open state.
 * @returns the danger-styled menu row.
 */
export function DeleteSessionMenuItem({
  sessionId, useMenuOpenState, deleteSession, t,
}: SessionMenuItemProps<DeleteSessionInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      danger
      icon={<IconTrashOutlineRegular size={14} />}
      onSelect={() => {
        setMenuOpen(false)
        deleteSession(sessionId)
      }}
    >
      {t('menu.deleteSession')}
    </MenuItemButton>
  )
}
