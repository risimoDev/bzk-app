/**
 * Проверка схемы полей шаблона документа и разметки для поисковиков.
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/check-document-templates.mjs
 *
 * Схему полей пишут руками в редакторе шаблона, а ошибка в ней видна
 * только в день, когда по шаблону начнут выпускать документ. Поэтому
 * разбор должен ловить её при сохранении и объяснять по-человечески.
 *
 * Разметка schema.org попадает в страницу внутри <script>: название
 * товара с «</script>» не должно закрыть тег посреди данных.
 */
import { parseFieldsSchema } from "../src/lib/document-templates.ts";
import { organizationJsonLd, productJsonLd, serializeJsonLd } from "../src/lib/json-ld.ts";

let failed = 0;

function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " - " + detail : ""}`);
  if (!ok) failed++;
}

const err = (raw) => {
  const r = parseFieldsSchema(raw);
  return r.ok ? null : r.error;
};

// ---------------------------------------------------------- схема полей

check("пустая схема допустима", parseFieldsSchema("  ").ok && parseFieldsSchema("").value === null);
check("не JSON - понятная ошибка", err("{fields: [}")?.includes("не JSON"), err("{fields: [}"));
check("массив вместо объекта отвергнут", Boolean(err("[1,2]")));
check("без fields отвергнуто", err('{"a":1}')?.includes("fields"), err('{"a":1}'));
check("поле без имени отвергнуто", err('{"fields":[{"label":"Клиент"}]}')?.includes("№ 1"));
check(
  "кириллица в имени отвергнута",
  err('{"fields":[{"name":"клиент"}]}')?.includes("латиница"),
  err('{"fields":[{"name":"клиент"}]}'),
);
check("пробел в имени отвергнут", Boolean(err('{"fields":[{"name":"client name"}]}')));
check("повтор имени отвергнут", err('{"fields":[{"name":"a"},{"name":"a"}]}')?.includes("дважды"));

const good = parseFieldsSchema('{"fields":[{"name":" client_name ","label":"Клиент","required":true},{"name":"sum"}]}');
check("правильная схема принята", good.ok);
if (good.ok) {
  check("имя обрезано от пробелов", good.value.fields[0].name === "client_name");
  check("тип по умолчанию - текст", good.value.fields[1].type === "text");
  check("обязательность сохранена", good.value.fields[0].required === true);
  check("лишние ключи не протекают", !("junk" in good.value.fields[1]));
}

// ------------------------------------------------------ разметка поиска

const hostile = serializeJsonLd({ name: "Визитки</script><script>alert(1)</script>" });
check("«</script>» в данных не закрывает тег", !hostile.includes("</script>"), hostile);
check("после экранирования JSON читается обратно", JSON.parse(hostile).name.startsWith("Визитки</script>"));

const product = productJsonLd({
  id: 101,
  name: "Визитки",
  description: null,
  imageUrl: "/api/product-image/aa.webp",
  basePrice: "4.50",
  tierPrices: ["3.20", "0", "4.00"],
  rating: null,
});
check("нижняя цена - минимум по ступеням", product.offers?.lowPrice === "3.20", product.offers?.lowPrice);
check("верхняя цена - максимум", product.offers?.highPrice === "4.50");
check("нулевая ступень не считается ценой", product.offers?.offerCount === 3);
check("картинка - полным адресом", /^https?:\/\/.+\/api\/product-image\/aa\.webp$/.test(product.image));
check("без отзывов нет оценки", !("aggregateRating" in product));

const noPrice = productJsonLd({
  id: 1, name: "Дизайн", description: "x", imageUrl: null, basePrice: "0", tierPrices: [], rating: { value: 4.5, count: 2 },
});
check("без цены нет предложения", !("offers" in noPrice));
check("оценка округлена до десятых", noPrice.aggregateRating?.ratingValue === "4.5");

const org = organizationJsonLd();
check("часы работы разобраны из справочника", org.openingHoursSpecification[0].opens === "11:00", org.openingHoursSpecification[0].opens);
check("телефон без пробелов", /^\+\d{11}$/.test(org.telephone), org.telephone);

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nОшибок: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
