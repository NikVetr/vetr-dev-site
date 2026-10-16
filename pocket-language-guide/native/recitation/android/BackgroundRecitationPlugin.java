package dev.vetr.pocketlanguageguide;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

@CapacitorPlugin(name = "BackgroundRecitation")
public class BackgroundRecitationPlugin extends Plugin {
    private RecitationService service;
    private boolean bound;
    private final List<Consumer<RecitationService>> waiting = new ArrayList<>();
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            service = ((RecitationService.LocalBinder) binder).service();
            service.listener = (state) -> notifyListeners("state", state);
            for (Consumer<RecitationService> action : new ArrayList<>(waiting)) action.accept(service);
            waiting.clear();
        }
        @Override public void onServiceDisconnected(ComponentName name) { service = null; }
    };

    private void withService(PluginCall call, Consumer<RecitationService> action) {
        getActivity().runOnUiThread(() -> {
            if (service != null) { service.ready(call, () -> action.accept(service)); return; }
            waiting.add((engine) -> engine.ready(call, () -> action.accept(engine)));
            if (!bound) {
                bound = getContext().bindService(new Intent(getContext(), RecitationService.class), connection, Context.BIND_AUTO_CREATE);
                if (!bound) { waiting.clear(); call.reject("Native playback service could not start"); }
            }
        });
    }

    @PluginMethod public void getVoices(PluginCall call) {
        withService(call, (engine) -> call.resolve(engine.voices(call.getString("locale", ""))));
    }
    @PluginMethod public void getState(PluginCall call) { withService(call, (engine) -> call.resolve(engine.state())); }
    @PluginMethod public void start(PluginCall call) { withService(call, (engine) -> engine.start(call)); }
    @PluginMethod public void pause(PluginCall call) { withService(call, (engine) -> { engine.pause(); call.resolve(engine.state()); }); }
    @PluginMethod public void resume(PluginCall call) { withService(call, (engine) -> { engine.resume(); call.resolve(engine.state()); }); }
    @PluginMethod public void stop(PluginCall call) { withService(call, (engine) -> { engine.stop("stopped", null); call.resolve(engine.state()); }); }

    @Override protected void handleOnDestroy() {
        if (service != null) service.listener = null;
        if (bound) getContext().unbindService(connection);
        bound = false;
        waiting.clear();
    }
}
