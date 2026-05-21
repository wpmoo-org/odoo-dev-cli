import { describe, expect, it, vi } from 'vitest';

import {
  consumePromptCancelKey,
  handlePromptCancel,
  handleUnavailableMenuChoice,
  installPromptCancelKeyTracker,
  isMenuBackSignal,
  menuIntroTitle,
  menuPromptMessage,
  MenuBackSignal,
  promptCancelOutcome,
  recordPromptCancelKey,
} from '../src/menu-navigation.js';

describe('menu navigation', () => {
  it('turns menu prompt cancellation into a back-navigation signal', () => {
    recordPromptCancelKey({ name: 'escape', sequence: '\u001B' });
    expect(() => handlePromptCancel(true, 'back')).toThrow(MenuBackSignal);

    try {
      recordPromptCancelKey({ name: 'escape', sequence: '\u001B' });
      handlePromptCancel(true, 'back');
    } catch (error) {
      expect(isMenuBackSignal(error)).toBe(true);
    }
  });

  it('ignores submitted prompt values', () => {
    expect(() => handlePromptCancel(false, 'back')).not.toThrow();
  });

  it('keeps submenu intros free of inline back hints', () => {
    expect(menuIntroTitle('Remove module', 'back')).toBe('Remove module');
    expect(menuIntroTitle('Remove module', 'exit')).toBe('Remove module');
  });

  it('keeps submenu prompt messages free of inline back hints', () => {
    expect(menuPromptMessage('Source repo', 'back')).toBe('Source repo');
    expect(menuPromptMessage('What do you want to do?', 'exit')).toBe('What do you want to do?');
  });

  it('returns to the menu from empty submenu states', () => {
    expect(() => handleUnavailableMenuChoice('back')).toThrow(MenuBackSignal);
    expect(() => handleUnavailableMenuChoice('exit')).not.toThrow();
  });

  it('treats Ctrl+C as exit even in back-enabled menus', () => {
    expect(promptCancelOutcome(true, 'back', 'interrupt')).toBe('exit');
    expect(promptCancelOutcome(true, 'back', 'escape')).toBe('back');
    expect(promptCancelOutcome(false, 'back', 'interrupt')).toBe('continue');
  });

  it('records and consumes the key that caused a prompt cancellation', () => {
    recordPromptCancelKey({ ctrl: true, name: 'c', sequence: '\u0003' });
    expect(consumePromptCancelKey()).toBe('interrupt');
    expect(consumePromptCancelKey()).toBeUndefined();

    recordPromptCancelKey({ name: 'escape', sequence: '\u001B' });
    expect(consumePromptCancelKey()).toBe('escape');
  });

  it('records non-escape non-interrupt cancellations as other', () => {
    recordPromptCancelKey({ name: 'x', sequence: 'x' });
    expect(consumePromptCancelKey()).toBe('other');
  });

  it('exits when a cancelled prompt uses exit behavior', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    try {
      recordPromptCancelKey({ name: 'escape', sequence: '\u001B' });
      handlePromptCancel(true, 'exit');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('exits when Ctrl+C is used in back-enabled menu cancellation', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    try {
      recordPromptCancelKey({ ctrl: true, name: 'c', sequence: '\u0003' });
      handlePromptCancel(true, 'back');
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it('treats non-interrupt cancellation keys as back in back-enabled menus', () => {
    recordPromptCancelKey({ name: 'x', sequence: 'x' });
    expect(() => handlePromptCancel(true, 'back')).toThrow(MenuBackSignal);
  });

  it('tracks only escape or ctrl keypresses from the installed listener', () => {
    const listeners = new Map<
      string,
      Array<(value: string, key: { ctrl?: boolean; name?: string; sequence?: string }) => void>
    >();
    const input = {
      on(event: string, listener: (value: string, key: { ctrl?: boolean; name?: string; sequence?: string }) => void) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        return this;
      },
      off(event: string, listener: (value: string, key: { ctrl?: boolean; name?: string; sequence?: string }) => void) {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
        );
        return this;
      },
      listenerCount(event: string) {
        return (listeners.get(event) ?? []).length;
      },
    } as unknown as NodeJS.ReadStream;

    const dispose = installPromptCancelKeyTracker(input);
    const listener = (listeners.get('keypress') ?? [])[0];
    expect(listener).toBeTypeOf('function');

    listener?.('', { name: 'a', sequence: 'a' });
    expect(consumePromptCancelKey()).toBeUndefined();
    listener?.('', { ctrl: true, name: 'c', sequence: '\u0003' });
    expect(consumePromptCancelKey()).toBe('interrupt');

    dispose();
    expect(listeners.get('keypress') ?? []).toHaveLength(0);
  });
});
