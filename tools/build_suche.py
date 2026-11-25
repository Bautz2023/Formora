#!/usr/bin/env python3
"""Suchindex lebensmittel/suche.json neu bauen.

Nimmt den bisherigen Index (beliebteste Produkte) und ergänzt ALLE Produkte aus den
Barcode-Dateien lebensmittel/bc-XX.json, deren Marke zu einem deutschen Supermarkt
oder Discounter gehört (Eigenmarken von Aldi, Lidl, Kaufland, Rewe, Edeka, Penny, Netto,
Norma, dm, Rossmann, Globus, tegut …).

Spalten: code, name, brand, kcal, c, f, p, pg, qty, store
Die Spalte `store` ist neu und optional (ältere App-Versionen lesen nur die ersten 9).

Aufruf: python3 tools/build_suche.py
"""
import glob, json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
LM = os.path.join(ROOT, "lebensmittel")

STORES = {
    "Aldi": """aldi, aldi bio, aldi sports, aldi süd, aldi nord, milsani, gut bio, gutbio, moser roth, choceur, lyttos, golden seafood, meine metzgerei, cucina, cucina nobile, snack fun, gartenkrone, rio d'oro, asia green garden, nur nur natur, mucci, almare, almare seafood, beste ernte, natur aktiv, mein veggie tag, my vay, le gusto, ein gutes stück heimat, biscotto, belbake, gut drei eichen, lacura, golden bridge, nature active bio, tandil, sun snacks, all seasons, lyttos, california garden, grandessa, gletscherkrone, alpenfest""",
    "Lidl": """lidl, lidl deluxe, deluxe lidl, deluxe, milbona, pilos, vemondo, dulano, crownfield, freshona, alesto, chef select, kania, solevita, fin carré, fin carre, snack day, combino, sondey, favorina, bellarom, baresa, italiamo, mcennedy, eridanous, trattoria alfredo, gelatelli, gourmet finest cuisine, linessa, grafschafter, nixe, oaklands, hearty food, envia, lord nelson, bio organic, formil, rivercote, cien, ocean sea, saskia, perlenbacher, fairglobe, w5, harvest basket, sol & mar, sol&mar, pikok, mister choc, bon gelati, tastino, culinea, primadonna, ma ingrédients, chef select & you, next level, next level meat, metzgerfrisch, golden sun, freeway, maribel, dulano selection, realvalle, toque du chef""",
    "Kaufland": """kaufland, kaufland classic, kaufland bio, k-classic, k classic, k-bio, k bio, k-favourites, k favourites, k-take it veggie, k take it veggie, k-purland, k purland, k-free, k free, k-to go, k to go, k-wertschätze, k wertschätze, k-classic bio, kaufland k-classic""",
    "Rewe": """rewe, ja!, ja, rewe beste wahl, rewe bio, rewe feine welt, rewe to go, rewe frei von, rewe regional,
        wilhelm brandenburg, rewe bio + vegan, rewe bio+vegan, rewe beste wahl bio, rewe frisch, rewe vegan""",
    "Edeka": """edeka, edeka bio, edeka herzstücke, gut & günstig, gut&günstig, gut und günstig, gut&guenstig, edeka genussmomente, edeka zuhause, edeka my veggie, edeka italia, edeka regional, edeka xxl, edeka bio vegan, edeka sushi, unsere heimat""",
    "Penny": """penny, penny ready, mühlenhof, penny bio, naturgut, naturgut bio, food for future, penny to go, penny regional""",
    "Netto": """netto, netto marken-discount, biobio, bio bio, gutes land, jeden tag, vegane zeiten""",
    "Norma": """norma, gut ernten, gourmet norma, mein norma""",
    "dm": """dm, dmbio, dm bio, dm-bio, dm sportness, sportness, babylove""",
    "Rossmann": """rossmann, ener bio, enerbio, babydream""",
    "Globus": """globus, globus vegan, globus bio""",
    "tegut": """tegut, tegut bio, tegut...""",
    "Marktkauf": """marktkauf""",
    "Metro": """metro, metro chef, aro, horeca select, metro premium""",
}

def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower())

BRAND2STORE = {}
for store, txt in STORES.items():
    for b in txt.split(","):
        b = norm(b)
        if b and b not in BRAND2STORE:
            BRAND2STORE[b] = store

def store_of(brand):
    b = norm(brand)
    if not b:
        return ""
    if b in BRAND2STORE:
        return BRAND2STORE[b]
    # „Milbona, Lidl“ oder „K-Classic Kaufland“: erste bekannte Marke im Text
    for part in re.split(r"[,;/]| - ", b):
        p = part.strip()
        if p in BRAND2STORE:
            return BRAND2STORE[p]
    for key in ("aldi", "lidl", "kaufland", "rewe", "edeka", "penny", "netto", "norma"):
        if re.search(r"\b" + key + r"\b", b):
            return BRAND2STORE[key]
    return ""


FOREIGN_CH = set("ñłśżźąęőűøåçãõșțčřůýœ")
FOREIGN_W = set("""de la le les du des con y et en el los las del al une un au aux sans avec
    met van het een zonder ongezoet gerookte gerookt
    with and of from the in style flavour flavor flavoured sweetened unsweetened chicken beef pork salted
    con di della alla allo al gusto senza
    och med utan ja ilman
    z ze bez na po dla oraz
    com sem para""".split())
GERMAN_W = set("""mit und ohne aus natur frisch käse wurst brot milch joghurt sahne schinken salami nudeln reis
    kartoffel kartoffeln gemüse obst saft tomaten hähnchen huhn pute rind schwein fisch lachs thunfisch
    schokolade keks kekse riegel müsli quark butter öl essig gewürz soße sauce suppe salat bio vegan
    fein feine klassisch klassik geräuchert gekocht vollkorn dinkel weizen roggen hafer""".split())

def german_name(name):
    n = name.lower()
    if any(ch in FOREIGN_CH for ch in n):
        return False
    words = re.findall(r"[a-zäöüßéèêàâîôûë']+", n)
    if any(ch in n for ch in "äöüß"):
        return True
    if any(w in GERMAN_W for w in words):
        return True
    if any(w in FOREIGN_W for w in words):
        return False
    return True

def ok_rec(name, kcal, c, f, p):
    if not name or kcal is None or c is None or f is None or p is None:
        return False
    try:
        kcal, c, f, p = float(kcal), float(c), float(f), float(p)
    except (TypeError, ValueError):
        return False
    if not (0 <= kcal <= 950 and 0 <= c <= 100 and 0 <= f <= 100 and 0 <= p <= 100):
        return False
    if c + f + p > 105:
        return False
    # grob plausibel: Energie aus Makros passt ungefähr (Ballaststoffe/Alkohol lassen Luft)
    est = 4 * c + 9 * f + 4 * p
    if kcal > 40 and est > 0 and not (0.55 <= kcal / est <= 1.6):
        return False
    return True

def r1(v):
    return None if v is None else round(float(v), 1)

def main():
    old = json.load(open(os.path.join(LM, "suche.json")))
    rows, seen = [], set()
    n_old = 0
    for a in old["r"]:
        code = str(a[0])
        if code in seen:
            continue
        seen.add(code)
        a = list(a[:9])
        a.append(store_of(a[2]))
        rows.append(a)
        n_old += 1
    # alte Einträge um den Supermarkt ergänzt; jetzt alle Supermarkt-Produkte aus den Barcode-Dateien
    added = 0
    per_store = {}
    for fn in sorted(glob.glob(os.path.join(LM, "bc-*.json"))):
        d = json.load(open(fn))
        for code, v in d.items():
            if code in seen:
                continue
            name, brand = (v[0] or "").strip(), (v[1] or "").strip()
            st = store_of(brand)
            if not st:
                continue
            if not ok_rec(name, v[2], v[3], v[4], v[5]):
                continue
            if len(name) < 3 or not german_name(name):
                continue
            seen.add(code)
            rows.append([code, name, brand, r1(v[2]), r1(v[3]), r1(v[4]), r1(v[5]), r1(v[10]) if v[10] else None, v[11] or "", st])
            added += 1
            per_store[st] = per_store.get(st, 0) + 1
    tot = {}
    for a in rows:
        if a[9]:
            tot[a[9]] = tot.get(a[9], 0) + 1
    out = {"v": 2, "stand": old.get("stand", ""), "f": ["code", "name", "brand", "kcal", "c", "f", "p", "pg", "qty", "store"], "r": rows}
    path = os.path.join(LM, "suche.json")
    with open(path, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"bisher {n_old}, neu {added}, gesamt {len(rows)}; {os.path.getsize(path)/1e6:.1f} MB")
    print("neu je Markt:", dict(sorted(per_store.items(), key=lambda x: -x[1])))
    print("gesamt je Markt:", dict(sorted(tot.items(), key=lambda x: -x[1])))

if __name__ == "__main__":
    main()
