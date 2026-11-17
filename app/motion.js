// Плавное движение для урока «Митоз»: никаких линейных перемещений.
// Всё считается от времени кадра (dt, секунды), поэтому скорость не зависит от частоты кадров.

// Плавный разгон и торможение: x от 0 до 1.
export const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// Пружина с затуханием: значение догоняет цель, слегка проскакивает её и успокаивается.
// stiffness — жёсткость (больше — быстрее), damping — затухание (больше — меньше колебаний).
export class Spring {
  constructor(value = 0, { stiffness = 18, damping = 5 } = {}) {
    this.value = this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }
  step(dt) {
    // Мелкие шаги: пружина не «взрывается» ни на долгом кадре, ни при ускоренной проверке.
    for (let left = dt; left > 0; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      this.velocity += ((this.target - this.value) * this.stiffness - this.velocity * this.damping) * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}
