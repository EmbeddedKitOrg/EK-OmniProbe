import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

function logDialogDebug(tag: "overlay" | "content", element: HTMLElement | null) {
  if (!element || typeof window === "undefined") {
    return;
  }

  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const centerX = Math.min(
    Math.max(rect.left + rect.width / 2, 0),
    Math.max(window.innerWidth - 1, 0)
  );
  const centerY = Math.min(
    Math.max(rect.top + rect.height / 2, 0),
    Math.max(window.innerHeight - 1, 0)
  );
  const topElement = document.elementFromPoint(centerX, centerY) as HTMLElement | null;

  console.info(`[dialog-debug:${tag}]`, {
    state: element.getAttribute("data-state"),
    className: element.className,
    zIndex: style.zIndex,
    opacity: style.opacity,
    visibility: style.visibility,
    display: style.display,
    pointerEvents: style.pointerEvents,
    backdropFilter: style.backdropFilter,
    rect: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    topElement: topElement
      ? {
          tag: topElement.tagName,
          className: topElement.className,
          text: topElement.textContent?.slice(0, 80) ?? "",
        }
      : null,
  });
}

function useDialogDebug(tag: "overlay" | "content", element: HTMLElement | null) {
  React.useEffect(() => {
    if (!element || typeof window === "undefined") {
      return;
    }

    console.info(`[dialog-debug:${tag}] mounted`);

    const emit = () => logDialogDebug(tag, element);
    const frame = window.requestAnimationFrame(emit);
    const timer = window.setTimeout(emit, 180);
    const observer = new MutationObserver(emit);

    observer.observe(element, {
      attributes: true,
      attributeFilter: ["class", "style", "data-state"],
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
      console.info(`[dialog-debug:${tag}] unmounted`);
    };
  }, [tag, element]);
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, style, ...props }, ref) => {
  const [element, setElement] =
    React.useState<React.ElementRef<typeof DialogPrimitive.Overlay> | null>(null)

  useDialogDebug("overlay", element)

  return (
    <DialogPrimitive.Overlay
      ref={(node) => {
        setElement(node)
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      }}
      style={{ zIndex: 70, ...style }}
      className={cn(
        "glass-overlay fixed inset-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
})
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, style, ...props }, ref) => {
  const [element, setElement] =
    React.useState<React.ElementRef<typeof DialogPrimitive.Content> | null>(null)

  useDialogDebug("content", element)

  return (
    <DialogPortal>
      <DialogOverlay />
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        style={{ pointerEvents: "none" }}
      >
        <DialogPrimitive.Content
          ref={(node) => {
            setElement(node)
            if (typeof ref === "function") {
              ref(node)
            } else if (ref) {
              ref.current = node
            }
          }}
          style={{ zIndex: 80, pointerEvents: "auto", ...style }}
          className={cn(
            "glass-dialog grid w-[min(calc(100vw-2rem),42rem)] max-h-[calc(100vh-2rem)] max-w-lg gap-4 overflow-y-auto p-6 text-foreground duration-200 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-[30px]",
            className
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground opacity-80 ring-offset-background transition-all hover:bg-white/72 hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </div>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
