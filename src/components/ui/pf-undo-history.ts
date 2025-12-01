import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { historyStore } from '../../stores/history';

@customElement('pf-undo-history')
export class PFUndoHistory extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--pf-color-bg-surface);
      border-left: 1px solid var(--pf-color-border);
      overflow: hidden;
    }

    .header {
      padding: 8px;
      font-size: 12px;
      font-weight: bold;
      border-bottom: 1px solid var(--pf-color-border);
      background-color: var(--pf-color-bg-panel-header);
    }

    .list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }

    .item {
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      color: var(--pf-color-text-muted);
    }

    .item:hover {
      background-color: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }

    .item.active {
      color: var(--pf-color-text-main);
      font-weight: bold;
    }

    .item.future {
      color: var(--pf-color-text-disabled);
      font-style: italic;
    }
  `;

  render() {
    const undoStack = historyStore.undoStack.value;
    const redoStack = historyStore.redoStack.value;
    
    // Combine stacks for display: [...undoStack, ...redoStack.reverse()]
    // But we want to show them in a list where the "current" state is at the bottom of undoStack
    
    return html`
      <div class="header">History</div>
      <div class="list">
        ${undoStack.map((cmd, i) => html`
          <div class="item active" @click=${() => this.jumpTo(i, 'undo')}>
            ${cmd.name}
          </div>
        `)}
        ${[...redoStack].reverse().map((cmd, i) => html`
          <div class="item future" @click=${() => this.jumpTo(i, 'redo')}>
            ${cmd.name}
          </div>
        `)}
      </div>
    `;
  }

  async jumpTo(index: number, type: 'undo' | 'redo') {
    if (type === 'undo') {
      // Undo until we reach this index (exclusive, so we keep this item)
      // Actually, if we click an item in undo stack, we usually want to revert TO that state
      // or revert BACK to that state?
      // Standard behavior: Click on a state to go to it.
      // If I click the last item in undo stack, nothing happens.
      // If I click the 2nd to last, I undo the last one.
      
      const undoStack = historyStore.undoStack.value;
      const stepsToUndo = undoStack.length - 1 - index;
      
      for (let i = 0; i < stepsToUndo; i++) {
        await historyStore.undo();
      }
    } else {
      // Redo until we include this item
      // redoStack is reversed in display. 
      // The first item in display (last in redoStack) is the immediate next redo.
      // Wait, I reversed it in render: [...redoStack].reverse()
      // So index 0 in display is redoStack[last].
      
      const redoStack = historyStore.redoStack.value;
      // If I click the first item in future list (which is the next redo), I want to redo 1 step.
      // The display index 0 corresponds to redoStack[length - 1].
      // The display index i corresponds to redoStack[length - 1 - i].
      
      const stepsToRedo = index + 1;
      for (let i = 0; i < stepsToRedo; i++) {
        await historyStore.redo();
      }
    }
  }
}
