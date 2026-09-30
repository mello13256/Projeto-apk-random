import com.android.apksig.ApkSigner;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/** Assina o APK (esquema v2) usando a biblioteca apksig do Android. */
public class Signer {
    public static void main(String[] a) throws Exception {
        if (a.length < 5) {
            System.err.println("uso: Signer <entrada.apk> <saida.apk> <keystore> <senha> <alias>");
            System.exit(1);
        }
        char[] pass = a[3].toCharArray();
        KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
        try (FileInputStream in = new FileInputStream(a[2])) {
            ks.load(in, pass);
        }
        PrivateKey key = (PrivateKey) ks.getKey(a[4], pass);
        X509Certificate cert = (X509Certificate) ks.getCertificate(a[4]);
        ApkSigner.SignerConfig sc = new ApkSigner.SignerConfig.Builder(
                "HORTA", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(sc))
                .setInputApk(new File(a[0]))
                .setOutputApk(new File(a[1]))
                .setMinSdkVersion(24)
                .setV1SigningEnabled(false) // Android 7+ so precisa da v2
                .setV2SigningEnabled(true)
                .build()
                .sign();
        System.out.println("APK assinado: " + a[1]);
    }
}
