import { signal } from '../core/signal';

class ColorStore {
  primaryColor = signal('#000000');
  secondaryColor = signal('#ffffff');

  setPrimaryColor(color: string) {
    this.primaryColor.value = color;
  }

  setSecondaryColor(color: string) {
    this.secondaryColor.value = color;
  }

  swapColors() {
    const temp = this.primaryColor.value;
    this.primaryColor.value = this.secondaryColor.value;
    this.secondaryColor.value = temp;
  }
}

export const colorStore = new ColorStore();
