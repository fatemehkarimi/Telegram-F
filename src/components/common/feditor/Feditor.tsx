import type { FC } from "../../../lib/teact/teact";
import React, { memo, useRef } from "../../../lib/teact/teact";
import { useController } from "./useController";
import styles from "./Feditor.module.scss";
import type { MutableRefObject } from "react";

type OwnProps = {
  apiRef?: MutableRefObject<FeditorHandle | null>;
};
export type FeditorHandle = {
  insertEmoji: (emoji: string) => void;
};

const Feditor: FC<OwnProps> = (ownProps) => {
  const inputRef = useRef<HTMLDivElement | null>(null);
  const {
    tree,
    insertEmoji,
    handlers: { handleKeyDown },
  } = useController(inputRef);

  if (ownProps.apiRef != null)
    ownProps.apiRef.current = {
      insertEmoji: (emoji) => {
        insertEmoji(emoji);
      },
    };

  return (
    <div
      className={styles.FeditorContainer}
      contentEditable="true"
      onKeyDown={handleKeyDown}
      ref={inputRef}
      onInput={(e) => e.preventDefault()}
    >
      {tree?.map((tree) => tree.render())}
    </div>
  );
};

export default memo(Feditor);
