import type { RefObject } from 'react';
import { useEffect } from '../../../../lib/teact/teact';
import { getActions } from '../../../../global';

import type { ApiSticker } from '../../../../api/types';
import type { Signal } from '../../../../util/signals';

import { EMOJI_IMG_REGEX } from '../../../../config';
import { requestNextMutation } from '../../../../lib/fasterdom/fasterdom';
import twemojiRegex from '../../../../lib/twemojiRegex';
import focusEditableElement from '../../../../util/focusEditableElement';
import { getHtmlBeforeSelection } from '../../../../util/selection';
import { IS_EMOJI_SUPPORTED } from '../../../../util/windowEnvironment';
import { buildCustomEmojiHtml } from '../helpers/customEmoji';

import { useThrottledResolver } from '../../../../hooks/useAsyncResolvers';
import useDerivedSignal from '../../../../hooks/useDerivedSignal';
import useDerivedState from '../../../../hooks/useDerivedState';
import useFlag from '../../../../hooks/useFlag';
import useLastCallback from '../../../../hooks/useLastCallback';

const THROTTLE = 300;
const RE_ENDS_ON_EMOJI = new RegExp(`(${twemojiRegex.source})$`, 'g');
const RE_ENDS_ON_EMOJI_IMG = new RegExp(`${EMOJI_IMG_REGEX.source}$`, 'g');

export default function useCustomEmojiTooltip(
  isEnabled: boolean,
  getHtml: Signal<string>,
  getSelectionRange: Signal<Range | undefined>,
  inputRef: RefObject<HTMLDivElement>,
  customEmojis?: ApiSticker[],
) {
  const { loadCustomEmojiForEmoji, clearCustomEmojiForEmoji } = getActions();

  const [isManuallyClosed, markManuallyClosed, unmarkManuallyClosed] = useFlag(false);

  const extractLastEmojiThrottled = useThrottledResolver(() => {
    const html = getHtml();
    if (!isEnabled || !html || !getSelectionRange()?.collapsed) return undefined;

    const hasEmoji = html.match(IS_EMOJI_SUPPORTED ? twemojiRegex : EMOJI_IMG_REGEX);
    if (!hasEmoji) return undefined;

    const htmlBeforeSelection = getHtmlBeforeSelection(inputRef.current!);

    return htmlBeforeSelection.match(IS_EMOJI_SUPPORTED ? RE_ENDS_ON_EMOJI : RE_ENDS_ON_EMOJI_IMG)?.[0];
  }, [getHtml, getSelectionRange, inputRef, isEnabled], THROTTLE);

  const getLastEmoji = useDerivedSignal(
    extractLastEmojiThrottled, [extractLastEmojiThrottled, getHtml, getSelectionRange], true,
  );

  const isActive = useDerivedState(() => Boolean(getLastEmoji()), [getLastEmoji]);
  const hasCustomEmojis = Boolean(customEmojis?.length);

  useEffect(() => {
    if (!isEnabled || !isActive) return;

    const lastEmoji = getLastEmoji();
    if (lastEmoji) {
      if (!hasCustomEmojis) {
        loadCustomEmojiForEmoji({
          emoji: IS_EMOJI_SUPPORTED ? lastEmoji : lastEmoji.match(/.+alt="(.+)"/)?.[1]!,
        });
      }
    } else {
      clearCustomEmojiForEmoji();
    }
  }, [isEnabled, isActive, getLastEmoji, hasCustomEmojis, clearCustomEmojiForEmoji, loadCustomEmojiForEmoji]);

  const insertCustomEmoji = useLastCallback((emoji: ApiSticker) => {
    const lastEmoji = getLastEmoji();
    if (!isEnabled || !lastEmoji || !inputRef.current) return;

    const inputEl = inputRef.current!;

    const selection = window.document.getSelection();
    if(selection != null && selection.rangeCount > 0) {
      let counter = 0;
      while(counter < 5000) {
        counter += 1;
        if(counter > 5000) {
          throw Error('too many iterations');
        }

        const clonedRange = selection.getRangeAt(0).cloneRange();
        selection.modify('extend', 'backward', 'character');
        let invalidSelection = false;

        // text is selected
        if(selection.toString() != "") {
          invalidSelection = true;
        }

        // children is not emoji anymore
        const range = selection.getRangeAt(0);
        const fragment = range.cloneContents();
        if(fragment.children.length > 0 && fragment.children[0].tagName != "IMG") {
          invalidSelection = true;
        }
        
        // emojis are different or is a custom emoji
        const firstChild = fragment.children[0] as HTMLImageElement;
        const lastChild = fragment.children[fragment.children.length - 1] as HTMLImageElement
        if(firstChild.alt != lastChild.alt || firstChild.className.includes('cutom-emoji')) {
          invalidSelection = true;
        }


        const isEverythingSeleted = clonedRange.cloneContents().children.length == fragment.children.length;
        if(invalidSelection || isEverythingSeleted) {
          selection.removeAllRanges();
          selection.addRange(clonedRange);
          counter--;
          break;
        }
      }

      let customEmojiStr = '';
      for(let i = 0; i < counter; ++i) {
        customEmojiStr += buildCustomEmojiHtml(emoji);
      }
      window.document.execCommand('insertHTML', false, `${customEmojiStr}`);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }))
    }
    
    requestNextMutation(() => {
      focusEditableElement(inputEl, true, true);
    });
  });

  useEffect(unmarkManuallyClosed, [unmarkManuallyClosed, getHtml]);

  return {
    isCustomEmojiTooltipOpen: Boolean(isActive && hasCustomEmojis && !isManuallyClosed),
    closeCustomEmojiTooltip: markManuallyClosed,
    insertCustomEmoji,
  };
}
