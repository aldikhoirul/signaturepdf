package com.tandatangan.pdf;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "PdfOpener")
public class PdfOpenerPlugin extends Plugin {

    private static final Object LOCK = new Object();
    private static final long MAX_BYTES = 25L * 1024L * 1024L;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private static JSObject pendingResult;
    private static boolean reading;

    @PluginMethod
    public void getPendingPdf(PluginCall call) {
        JSObject result;
        synchronized (LOCK) {
            result = pendingResult;
            pendingResult = null;
        }
        call.resolve(result != null ? result : new JSObject());
    }

    public static void handleIntent(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }

        Uri uri = null;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        if (uri == null) {
            return;
        }

        final Uri source = uri;
        final Context appContext = context.getApplicationContext();

        synchronized (LOCK) {
            if (reading) {
                return;
            }
            reading = true;
            pendingResult = null;
        }

        EXECUTOR.execute(
            () -> {
                JSObject result;
                try {
                    result = readPdf(appContext, source);
                } catch (Exception error) {
                    result = new JSObject();
                    String message = error.getMessage();
                    result.put("error", message != null && !message.isEmpty() ? message : "PDF dari aplikasi lain gagal dibaca.");
                }
                synchronized (LOCK) {
                    pendingResult = result;
                    reading = false;
                }
            }
        );
    }

    private static JSObject readPdf(Context context, Uri source) throws Exception {
        byte[] bytes;
        try (InputStream input = context.getContentResolver().openInputStream(source)) {
            if (input == null) {
                throw new Exception("PDF tidak dapat dibuka dari aplikasi pengirim.");
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            long total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BYTES) {
                    throw new Exception("PDF terlalu besar. Maksimal 25 MB.");
                }
                output.write(buffer, 0, read);
            }
            bytes = output.toByteArray();
        }

        if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F') {
            throw new Exception("File yang dibuka bukan dokumen PDF.");
        }

        JSObject result = new JSObject();
        result.put("name", displayName(context, source));
        result.put("size", bytes.length);
        result.put("mimeType", "application/pdf");
        result.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
        return result;
    }

    private static String displayName(Context context, Uri source) {
        String name = null;
        try (
            Cursor cursor = context
                .getContentResolver()
                .query(source, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    name = cursor.getString(index);
                }
            }
        } catch (Exception ignored) {
            // Sebagian provider tidak mengizinkan query nama file.
        }

        if (name == null || name.trim().isEmpty()) {
            String last = source.getLastPathSegment();
            name = last != null && last.toLowerCase(Locale.US).endsWith(".pdf") ? last : "dokumen.pdf";
        }
        return name;
    }
}
