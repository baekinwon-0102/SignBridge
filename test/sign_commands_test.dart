import 'package:flutter_test/flutter_test.dart';
import 'package:testsign/src/sign_commands.dart';

void main() {
  test('Only requested translated words trigger actions', () {
    for (final entry in shortcutCommands.entries) {
      expect(resolveCommand(entry.key), entry.value);
      expect(resolveCommand(' ${entry.key}! '), entry.value);
    }
    for (final text in ['1', '119', '전화 끊어줘', '아프다 아님', '회사에 가지 마', '위로', '']) {
      expect(resolveCommand(text), isNull);
    }
  });
  test('Confidence and rearming prevent duplicate execution', () {
    final gate = CommandGate();
    for (final confidence in [.1, double.nan, double.infinity, 1.1]) {
      expect(gate.accept(SignPrediction('아프다', confidence)), isNull);
    }
    expect(gate.accept(const SignPrediction('의사', .85)), 'emergency');
    expect(gate.accept(const SignPrediction('구급차', .99)), isNull);
    gate.reset();
    expect(gate.accept(const SignPrediction('구급차', .99)), 'emergency');
  });
  test('Camera display yields the translated word', () {
    expect(SignPrediction.fromDisplay('회사 · 95%')!.text, '회사');
  });
}
