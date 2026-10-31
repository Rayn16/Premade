using System;
using System.Linq;
using System.Numerics;
using System.Security.Cryptography;

namespace RE4Helper
{
    // WireGuard keys (Curve25519, RFC 7748), made here so no key ever goes through another program's input.
    public static class X25519
    {
        static readonly BigInteger P = BigInteger.Pow(2, 255) - 19;
        static BigInteger Mod(BigInteger a) { var r = a % P; return r.Sign < 0 ? r + P : r; }

        public static (string Private, string Public) NewKeyPair()
        {
            var k = new byte[32];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(k);
            k[0] &= 248; k[31] &= 127; k[31] |= 64;
            var priv = Convert.ToBase64String(k);
            return (priv, PublicOf(priv));
        }

        public static string PublicOf(string privateKey)
        {
            var k = Convert.FromBase64String(privateKey);
            k[0] &= 248; k[31] &= 127; k[31] |= 64;
            BigInteger x1 = 9, x2 = 1, z2 = 0, x3 = 9, z3 = 1;
            var swap = 0;
            for (int t = 254; t >= 0; t--)
            {
                var bit = (k[t >> 3] >> (t & 7)) & 1;
                if ((swap ^ bit) == 1) { (x2, x3) = (x3, x2); (z2, z3) = (z3, z2); }
                swap = bit;
                BigInteger a = x2 + z2, aa = Mod(a * a), b = x2 - z2, bb = Mod(b * b), e = aa - bb, c = x3 + z3, d = x3 - z3, da = Mod(d * a), cb = Mod(c * b);
                x3 = Mod((da + cb) * (da + cb));
                z3 = Mod(x1 * Mod((da - cb) * (da - cb)));
                x2 = Mod(aa * bb);
                z2 = Mod(e * (aa + 121665 * e));
            }
            if (swap == 1) { x2 = x3; z2 = z3; }
            var u = Mod(x2 * BigInteger.ModPow(z2, P - 2, P));
            var bytes = u.ToByteArray().Concat(new byte[32]).Take(32).ToArray();   // little-endian, as the key format wants
            return Convert.ToBase64String(bytes);
        }
    }
}
