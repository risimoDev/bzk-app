"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, Star, Trash2, TriangleAlert, Upload } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { ProductImage } from "@/components/catalog/ProductImage";
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_KINDS,
  type ProductImageKind,
} from "@/lib/product-images";
import {
  uploadProductImage,
  deleteProductImage,
  setMainProductImage,
  type ImageState,
} from "../actions";
import { cn } from "@/lib/cn";

export type ProductImageRow = {
  id: number;
  imageUrl: string;
  isMain: boolean;
  kind: string;
};

const initial: ImageState = {};

/**
 * Картинки товара в админке.
 *
 * Разделены по назначению: логотип уходит в каталог, фотографии - в
 * карточку товара. Порядок фотографий задаётся не перетаскиванием, а
 * выбором главной: в карточке крупно показывается только она, остальные
 * идут превью, и точный их порядок роли не играет.
 */
export function ProductImages({
  productId,
  images,
  readOnly,
}: {
  productId: number;
  images: ProductImageRow[];
  readOnly: boolean;
}) {
  const logo = images.find((i) => i.kind === "logo") ?? null;
  const photos = images.filter((i) => i.kind !== "logo");

  return (
    <section className="rounded-xl border border-ink/10 bg-bone p-5 sm:p-6">
      <h2 className="font-display text-[0.62rem] tracking-[0.18em] text-ink/40">
        КАРТИНКИ
      </h2>

      <div className="mt-4 grid gap-6 lg:grid-cols-[16rem_1fr] lg:items-start">
        {/* ---------- Логотип ---------- */}
        <div>
          <p className="text-sm text-ink">{PRODUCT_IMAGE_KINDS.logo.label}</p>
          <p className="mt-0.5 text-xs text-ink/45">{PRODUCT_IMAGE_KINDS.logo.hint}</p>

          <div className="relative mt-3 aspect-4/3 overflow-hidden rounded-lg border border-ink/10 bg-ice">
            <ProductImage src={logo?.imageUrl ?? null} alt="Логотип товара" sizes="256px" />
          </div>

          {logo && !readOnly && <DeleteButton imageId={logo.id} className="mt-2" />}

          {!readOnly && (
            <UploadForm
              productId={productId}
              kind="logo"
              label={logo ? "Заменить логотип" : "Загрузить логотип"}
            />
          )}
        </div>

        {/* ---------- Фотографии ---------- */}
        <div>
          <p className="text-sm text-ink">Фотографии готовых работ</p>
          <p className="mt-0.5 text-xs text-ink/45">{PRODUCT_IMAGE_KINDS.photo.hint}</p>

          {photos.length === 0 ? (
            <p className="mt-3 rounded-lg bg-paper px-4 py-3 text-sm text-ink/50">
              Фотографий нет - в карточке товара пока показывается логотип.
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {photos.map((photo) => (
                <li
                  key={photo.id}
                  className={cn(
                    "overflow-hidden rounded-lg border bg-paper",
                    photo.isMain ? "border-brand/50" : "border-ink/10",
                  )}
                >
                  <div className="relative aspect-square bg-ice">
                    <ProductImage src={photo.imageUrl} alt="Фото работы" sizes="200px" />
                    {photo.isMain && (
                      <span className="absolute left-1.5 top-1.5 rounded-pill bg-brand px-2 py-0.5 font-display text-[0.55rem] tracking-[0.12em] text-bone">
                        ГЛАВНОЕ
                      </span>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                      {photo.isMain ? (
                        <span className="text-xs text-ink/35">Открывает карточку</span>
                      ) : (
                        <MainButton imageId={photo.id} />
                      )}
                      <DeleteButton imageId={photo.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!readOnly && (
            <UploadForm productId={productId} kind="photo" label="Добавить фото" multiple />
          )}
        </div>
      </div>
    </section>
  );
}

/** Одна форма на оба назначения: отличаются только подпись и признак. */
function UploadForm({
  productId,
  kind,
  label,
  multiple,
}: {
  productId: number;
  kind: ProductImageKind;
  label: string;
  multiple?: boolean;
}) {
  const [state, action, pending] = useActionState(uploadProductImage, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // После удачной загрузки очищаем поле: иначе браузер продолжает
  // показывать имя уже загруженного файла, как будто он ждёт отправки
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="kind" value={kind} />

      <input
        type="file"
        name="files"
        accept={PRODUCT_IMAGE_ACCEPT}
        multiple={multiple}
        required
        className="w-full rounded-lg border border-ink/15 bg-bone px-3 py-2 text-xs text-ink file:mr-3 file:rounded-pill file:border-0 file:bg-ink file:px-3 file:py-1 file:font-display file:text-[0.6rem] file:tracking-wider file:text-bone hover:border-ink/30"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs text-bone transition-colors hover:bg-brand-bright disabled:opacity-50"
        >
          <Upload className="size-3.5" aria-hidden />
          {pending ? "Загружаю…" : label}
        </button>

        <Status state={state} />
      </div>

      <p className="text-xs text-ink/40">
        JPG, PNG или WebP, до 8 МБ{multiple ? ". Можно выбрать несколько" : ""}.
      </p>
    </form>
  );
}

function MainButton({ imageId }: { imageId: number }) {
  const [state, action, pending] = useActionState(setMainProductImage, initial);

  return (
    <form action={action}>
      <input type="hidden" name="imageId" value={imageId} />
      <button
        type="submit"
        disabled={pending}
        title={state.error ?? "Показывать крупно в карточке"}
        className={cn(
          "flex items-center gap-1 text-xs transition-colors disabled:opacity-50",
          state.error ? "text-danger" : "text-ink/45 hover:text-brand",
        )}
      >
        <Star className="size-3.5" aria-hidden />
        Главное
      </button>
    </form>
  );
}

/**
 * Удаление с подтверждением: файл уходит с сервера, и вернуть снимок
 * можно только загрузив заново - а под рукой его может уже не быть.
 */
function DeleteButton({
  imageId,
  className,
}: {
  imageId: number;
  className?: string;
}) {
  const [state, action, pending] = useActionState(deleteProductImage, initial);

  return (
    <form action={action} className={className}>
      <input type="hidden" name="imageId" value={imageId} />
      <ConfirmButton
        title="Удалить картинку?"
        text="Файл удалится с сервера. Вернуть его можно, только загрузив заново."
        disabled={pending}
        hint={state.error ?? "Удалить"}
        className={cn(
          "flex items-center gap-1 text-xs transition-colors disabled:opacity-50",
          state.error ? "text-danger" : "text-ink/40 hover:text-danger",
        )}
      >
        <Trash2 className="size-3.5" aria-hidden />
        {pending ? "Удаляю…" : "Удалить"}
      </ConfirmButton>
    </form>
  );
}

function Status({ state }: { state: ImageState }) {
  const text = state.error ?? state.message;
  if (!text) return null;

  return (
    <span
      role="status"
      className={cn(
        "flex items-center gap-1.5 text-xs",
        state.error ? "text-danger" : "text-ok",
      )}
    >
      {state.error ? (
        <TriangleAlert className="size-3.5" aria-hidden />
      ) : (
        <Check className="size-3.5" aria-hidden />
      )}
      {text}
    </span>
  );
}
