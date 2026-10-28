package com.tandatangan.pdf;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private boolean activityCreated;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfOpenerPlugin.class);
        super.onCreate(savedInstanceState);
        activityCreated = true;
        PdfOpenerPlugin.handleIntent(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // BridgeActivity.load() juga memanggil onNewIntent untuk intent awal; lewati agar tidak diproses dua kali.
        if (!activityCreated) {
            return;
        }
        setIntent(intent);
        PdfOpenerPlugin.handleIntent(this, intent);
    }
}
