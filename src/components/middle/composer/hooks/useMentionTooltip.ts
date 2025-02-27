import type { RefObject } from 'react';
import { useEffect, useState } from '../../../../lib/teact/teact';
import { getGlobal } from '../../../../global';

import type { ApiChatMember, ApiUser } from '../../../../api/types';
import type { Signal } from '../../../../util/signals';
import { ApiMessageEntityTypes } from '../../../../api/types';

import { requestNextMutation } from '../../../../lib/fasterdom/fasterdom';
import { filterUsersByName, getMainUsername, getUserFirstOrLastName } from '../../../../global/helpers';
import focusEditableElement from '../../../../util/focusEditableElement';
import { pickTruthy, unique } from '../../../../util/iteratees';
import { getCaretPosition, getHtmlBeforeSelection, insertHtmlInSelection, setCaretPosition } from '../../../../util/selection';
import { prepareForRegExp } from '../helpers/prepareForRegExp';

import { useThrottledResolver } from '../../../../hooks/useAsyncResolvers';
import useDerivedSignal from '../../../../hooks/useDerivedSignal';
import useFlag from '../../../../hooks/useFlag';
import useLastCallback from '../../../../hooks/useLastCallback';

const THROTTLE = 300;

let RE_USERNAME_SEARCH: RegExp;
try {
  RE_USERNAME_SEARCH = /(^|\s)@[-_\p{L}\p{M}\p{N}]*$/gui;
} catch (e) {
  // Support for older versions of Firefox
  RE_USERNAME_SEARCH = /(^|\s)@[-_\d\wа-яёґєії]*$/gi;
}

export default function useMentionTooltip(
  isEnabled: boolean,
  getHtml: Signal<string>,
  getSelectionRange: Signal<Range | undefined>,
  inputRef: RefObject<HTMLDivElement>,
  groupChatMembers?: ApiChatMember[],
  topInlineBotIds?: string[],
  currentUserId?: string,
) {
  const [filteredUsers, setFilteredUsers] = useState<ApiUser[] | undefined>();
  const [isManuallyClosed, markManuallyClosed, unmarkManuallyClosed] = useFlag(false);

  const extractUsernameTagThrottled = useThrottledResolver(() => {
    const html = getHtml();
    if (!isEnabled || !getSelectionRange()?.collapsed || !html.includes('@')) return undefined;

    const htmlBeforeSelection = getHtmlBeforeSelection(inputRef.current!);

    return prepareForRegExp(htmlBeforeSelection).match(RE_USERNAME_SEARCH)?.[0].trim();
  }, [isEnabled, getHtml, getSelectionRange, inputRef], THROTTLE);

  const getUsernameTag = useDerivedSignal(
    extractUsernameTagThrottled, [extractUsernameTagThrottled, getHtml, getSelectionRange], true,
  );

  const getWithInlineBots = useDerivedSignal(() => {
    return isEnabled && getHtml().startsWith('@');
  }, [getHtml, isEnabled]);

  useEffect(() => {
    const usernameTag = getUsernameTag();

    if (!usernameTag || !(groupChatMembers || topInlineBotIds)) {
      setFilteredUsers(undefined);
      return;
    }

    // No need for expensive global updates on users, so we avoid them
    const usersById = getGlobal().users.byId;
    if (!usersById) {
      setFilteredUsers(undefined);
      return;
    }

    const memberIds = groupChatMembers?.reduce((acc: string[], member) => {
      if (member.userId !== currentUserId) {
        acc.push(member.userId);
      }

      return acc;
    }, []);

    const filter = usernameTag.substring(1);
    const filteredIds = filterUsersByName(unique([
      ...((getWithInlineBots() && topInlineBotIds) || []),
      ...(memberIds || []),
    ]), usersById, filter);

    setFilteredUsers(Object.values(pickTruthy(usersById, filteredIds)));
  }, [currentUserId, groupChatMembers, topInlineBotIds, getUsernameTag, getWithInlineBots]);

  const insertMention = useLastCallback((user: ApiUser, forceFocus = false) => {
    if (!user.usernames && !getUserFirstOrLastName(user)) {
      return;
    }

    const mainUsername = getMainUsername(user);
    const userFirstOrLastName = getUserFirstOrLastName(user) || '';
    const htmlToInsert = mainUsername
      ? `@${mainUsername}`
      : `<a
          class="text-entity-link"
          data-entity-type="${ApiMessageEntityTypes.MentionName}"
          data-user-id="${user.id}"
          contenteditable="false"
          dir="auto"
        >${userFirstOrLastName}</a>`;

    const inputEl = inputRef.current!;

    const htmlBeforeSelection = getHtmlBeforeSelection(inputEl);
    const fixedHtmlBeforeSelection = cleanWebkitNewLines(htmlBeforeSelection);
    const atIndex = fixedHtmlBeforeSelection.lastIndexOf('@');

    const matches = fixedHtmlBeforeSelection.match(RE_USERNAME_SEARCH);
    if (atIndex !== -1) {
      const match = matches ? matches[0]?.trimStart() : getHtml();

      const selection = document.getSelection();
      let counter = 0;
      while(selection && match && selection.toString() !== match) {
        if(++counter >= 5000) {
          throw new Error('too many iterations in mention tooltip');
        }
        selection.modify('extend', 'backward', 'character');
      }

      window.document.execCommand('insertHTML', false, `${htmlToInsert} `);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      requestNextMutation(() => {
        focusEditableElement(inputEl, true, true);
      });
    }

    setFilteredUsers(undefined);
  });

  useEffect(unmarkManuallyClosed, [unmarkManuallyClosed, getHtml]);

  return {
    isMentionTooltipOpen: Boolean(filteredUsers?.length && !isManuallyClosed),
    closeMentionTooltip: markManuallyClosed,
    insertMention,
    mentionFilteredUsers: filteredUsers,
  };
}

// Webkit replaces the line break with the `<div><br /></div>` or `<div></div>` code.
// It is necessary to clean the html to a single form before processing.
function cleanWebkitNewLines(html: string) {
  return html.replace(/<div>(<br>|<br\s?\/>)?<\/div>/gi, '<br>');
}
