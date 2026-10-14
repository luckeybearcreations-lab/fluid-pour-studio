package com.luckybear.fluidstudio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The studio is laid out for a fixed text size. Without this, a large
        // phone font setting blows up every label and pushes buttons off screen.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
