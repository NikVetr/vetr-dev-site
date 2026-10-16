package dev.vetr.pocketlanguageguide;

import android.speech.tts.Voice;
import android.speech.tts.TextToSpeech;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

final class RecitationPlan {
    static final long MAX_DURATION_MS = 6 * 60 * 60 * 1000L;
    final List<Step> steps = new ArrayList<>();
    final boolean repeat;
    static final class Audio {
        String text;
        Voice voice;
        float rate;
    }
    static final class Step {
        String id;
        long delayMs;
        final List<Audio> audio = new ArrayList<>();
    }

    RecitationPlan(JSONObject input, Set<Voice> voices) throws Exception {
        JSONArray list = input.getJSONArray("steps");
        if (list.length() == 0 || list.length() > 10000) throw new Exception("Choose between 1 and 10000 playback steps");
        repeat = input.optBoolean("repeat", false);
        int characters = 0;
        long delays = 0;
        boolean audible = false;
        for (int i = 0; i < list.length(); i++) {
            JSONObject raw = list.getJSONObject(i);
            Step step = new Step();
            step.id = raw.getString("id");
            double delay = raw.getDouble("delayMs");
            if (!Double.isFinite(delay) || delay < 0 || delay > 600000 || delay != Math.floor(delay)) {
                throw new Exception("Each playback delay must be between 0 and 600000 milliseconds");
            }
            step.delayMs = (long) delay;
            delays += step.delayMs;
            JSONArray clips = raw.getJSONArray("audio");
            if (clips.length() > 16) throw new Exception("A playback step may have at most 16 spoken parts");
            for (int k = 0; k < clips.length(); k++) {
                JSONObject clip = clips.getJSONObject(k);
                Audio audio = new Audio();
                audio.text = clip.getString("text").trim();
                if (audio.text.isEmpty() || audio.text.length() > TextToSpeech.getMaxSpeechInputLength()) {
                    throw new Exception("A spoken phrase is empty or exceeds the speech engine's text limit");
                }
                audio.voice = choose(voices, clip.getString("locale"), clip.optString("voiceId", ""));
                double rate = clip.optDouble("rate", 1);
                if (!Double.isFinite(rate) || rate < 0.25 || rate > 2) throw new Exception("Speech rate must be between 0.25 and 2");
                audio.rate = (float) rate;
                characters += audio.text.length();
                step.audio.add(audio);
                audible = true;
            }
            steps.add(step);
        }
        if (!audible) throw new Exception("Background playback needs at least one spoken phrase");
        if (characters > 1000000 || delays > MAX_DURATION_MS) throw new Exception("Playback is limited to one million characters and six hours per sequence");
    }

    static String canonical(String tag) {
        String value = tag.replace('_', '-').toLowerCase(Locale.ROOT);
        if (value.equals("iw") || value.startsWith("iw-")) return "he" + value.substring(2);
        if (value.equals("in") || value.startsWith("in-")) return "id" + value.substring(2);
        if (value.equals("jw") || value.startsWith("jw-")) return "jv" + value.substring(2);
        if (value.equals("tl") || value.startsWith("tl-")) return "fil" + value.substring(2);
        return value;
    }

    static boolean matches(String requested, String actual) {
        String need = canonical(requested), have = canonical(actual);
        if (need.isEmpty() || need.equals("tlh") || need.equals("qya")) return false;
        if (need.equals("zh-cn") || need.equals("zh-hans") || need.equals("cmn")) {
            return have.equals("zh-cn") || have.equals("zh-sg") || have.equals("zh-tw")
                || have.equals("zh-hans") || have.startsWith("cmn-") || have.equals("cmn");
        }
        return need.split("-", 2)[0].equals(have.split("-", 2)[0]);
    }

    static Voice choose(Set<Voice> voices, String locale, String id) throws Exception {
        if (voices == null) throw new Exception("No downloaded speech voices are available");
        return voices.stream().filter((voice) -> local(voice)
                && matches(locale, voice.getLocale().toLanguageTag()) && (id.isEmpty() || voice.getName().equals(id)))
            .sorted((a, b) -> {
                int exact = Boolean.compare(!canonical(a.getLocale().toLanguageTag()).equals(canonical(locale)),
                    !canonical(b.getLocale().toLanguageTag()).equals(canonical(locale)));
                return exact != 0 ? exact : a.getName().compareTo(b.getName());
            }).findFirst().orElseThrow(() -> new Exception("Download a local speech voice for " + locale
                + (id.isEmpty() ? "" : "; the selected voice is unavailable")));
    }

    static boolean local(Voice voice) {
        // Android explicitly permits another voice to be substituted while a
        // notInstalled voice downloads. Such a voice is not an offline choice.
        return !voice.isNetworkConnectionRequired() && (voice.getFeatures() == null
            || !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED));
    }
}
