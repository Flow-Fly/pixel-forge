import { afterEach, describe, expect, it } from 'vitest';
import { html } from 'lit';
import { BaseComponent } from '../../src/core/base-component';
import {
  createProjectContext,
  defaultProjectContext,
  restoreDefaultProjectContext,
  setActiveProjectContext,
  type ProjectContext,
} from '../../src/stores/project-context';

const createdContexts: ProjectContext[] = [];

function createNamedContext(name: string) {
  const context = createProjectContext();
  context.project.name.value = name;
  createdContexts.push(context);
  return context;
}

async function flushContextChange() {
  await Promise.resolve();
}

class ActiveContextTestComponent extends BaseComponent {
  events: string[] = [];
  manualDispose?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.manualDispose = this.subscribeToActiveProjectContext((context) => {
      const name = context.project.name.value;
      this.events.push(`bind:${name}`);
      return () => {
        this.events.push(`dispose:${name}`);
      };
    });
  }

  render() {
    return html``;
  }
}

if (!customElements.get('active-context-test-component')) {
  customElements.define('active-context-test-component', ActiveContextTestComponent);
}

function createComponent() {
  const component = document.createElement(
    'active-context-test-component'
  ) as ActiveContextTestComponent;
  document.body.append(component);
  return component;
}

describe('BaseComponent active project context helper', () => {
  afterEach(() => {
    document.body.replaceChildren();
    restoreDefaultProjectContext();
    for (const context of createdContexts.splice(0)) {
      context.dispose();
    }
  });

  it('runs the callback for the current active context', () => {
    const component = createComponent();

    expect(component.events).toEqual([`bind:${defaultProjectContext.project.name.value}`]);
  });

  it('disposes the previous context subscription before rebinding', async () => {
    const contextA = createNamedContext('Context A');
    const contextB = createNamedContext('Context B');
    setActiveProjectContext(contextA);

    const component = createComponent();
    setActiveProjectContext(contextB);
    await flushContextChange();

    expect(component.events).toEqual(['bind:Context A', 'dispose:Context A', 'bind:Context B']);
  });

  it('cleans up the current context subscription on disconnect', async () => {
    const contextA = createNamedContext('Context A');
    const contextB = createNamedContext('Context B');
    setActiveProjectContext(contextA);
    const component = createComponent();

    document.body.replaceChildren();
    setActiveProjectContext(contextB);
    await flushContextChange();

    expect(component.events).toEqual(['bind:Context A', 'dispose:Context A']);
  });

  it('lets callers dispose a subscription manually', async () => {
    const contextA = createNamedContext('Context A');
    const contextB = createNamedContext('Context B');
    setActiveProjectContext(contextA);
    const component = createComponent();

    component.manualDispose?.();
    setActiveProjectContext(contextB);
    await flushContextChange();

    expect(component.events).toEqual(['bind:Context A', 'dispose:Context A']);
  });
});
