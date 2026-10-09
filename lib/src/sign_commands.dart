class SignPrediction {
  const SignPrediction(this.text, this.confidence);
  final String text;
  final double confidence;
  static SignPrediction? fromDisplay(String value) {
    final match = RegExp(r'^(.*) · (\d+)%$').firstMatch(value);
    if (match == null) return null;
    return SignPrediction(match[1]!, int.parse(match[2]!) / 100);
  }
}

const shortcutCommands = <String, String>{
  '아프다': 'emergency',
  '구급차': 'emergency',
  '의사': 'emergency',
  '회사': 'company',
  '엄마': 'mother',
  '위': 'volumeUp',
  '아래': 'volumeDown',
};
String? resolveCommand(String text) =>
    shortcutCommands[text.trim().replaceAll(RegExp(r'[.!?。]+$'), '')];

/// Held signs execute once until explicitly rearmed.
class CommandGate {
  bool armed = true;
  void reset() => armed = true;
  String? accept(SignPrediction prediction) {
    if (!armed ||
        !prediction.confidence.isFinite ||
        prediction.confidence < .85 ||
        prediction.confidence > 1) return null;
    final command = resolveCommand(prediction.text);
    if (command != null) armed = false;
    return command;
  }
}
