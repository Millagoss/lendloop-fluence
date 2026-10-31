"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  Flower2,
  Handshake,
  Leaf,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Tent,
  Trash2,
  Utensils,
  Wrench,
  X,
  Zap,
  Pencil,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import {
  categories,
  conditions,
  today,
  type Category,
  type Condition,
} from "@/lib/domain";

type Tool = FunctionReturnType<typeof api.tools.list>[number];
type Loan = FunctionReturnType<typeof api.loans.list>[number];
type View = "browse" | "listings" | "requests" | "incoming" | "admin";
const icons = {
  "Power tools": Zap,
  Garden: Flower2,
  Kitchen: Utensils,
  Camping: Tent,
  "Hand tools": Wrench,
  Other: Sparkles,
};
function CategoryIcon({
  category,
  size = 32,
}: {
  category: string;
  size?: number;
}) {
  const Icon = icons[category as Category] ?? Wrench;
  return <Icon size={size} strokeWidth={1.4} aria-hidden="true" />;
}
function Logo() {
  return (
    <Link className="logo" href="/" aria-label="LendLoop home">
      <span className="logo-icon">
        <Handshake size={23} />
      </span>
      LendLoop<span className="logo-dot">.</span>
    </Link>
  );
}
function Login({
  children,
  className = "button primary",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <SignInButton mode="modal">
      <button className={className}>{children}</button>
    </SignInButton>
  );
}
function Frame({
  children,
  account,
}: {
  children: ReactNode;
  account?: ReactNode;
}) {
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Logo />
          <div className="header-note">
            <span className="live-dot" /> Good things live next door
          </div>
          <div className="account">{account}</div>
        </div>
      </header>
      {children}
      <footer>
        <Logo />
        <p>Less stuff. More possibility. Better neighbors.</p>
        <span>
          Made for sharing <Leaf size={14} />
        </span>
      </footer>
    </>
  );
}
export function LendLoop({ configured }: { configured: boolean }) {
  if (!configured)
    return (
      <Frame>
        <Hero />
        <section className="content setup">
          <span className="eyebrow">LET’S GET CONNECTED</span>
          <h2>Your neighborhood starts here.</h2>
          <p>
            Connect Clerk and Convex to open the tool library. This installation
            is waiting for its service configuration.
          </p>
          <p className="muted">
            Follow the local setup in README.md, then restart the app. No
            example listings are presented as live data.
          </p>
        </section>
      </Frame>
    );
  return <Connected />;
}
function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow">
          <span /> THE NEIGHBORHOOD, RECONNECTED
        </div>
        <h1>
          Big plans.
          <br />
          Borrowed tools.
          <br />
          <em>Better together.</em>
        </h1>
        <p>
          Borrow what you need. Lend what you don’t.
          <br />A little less buying, a lot more sharing.
        </p>
        <a href="#tool-library" className="button primary">
          Find your next tool <ArrowRight size={17} />
        </a>
        <div className="hero-foot">
          <span className="tiny-icon">
            <Leaf size={15} />
          </span>{" "}
          Good for your project. Better for the planet.
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="art-grid" />
        <div className="art-caption">
          THE THINGS WE SHARE
          <br />
          <strong>bring us closer.</strong>
        </div>
        <div className="art-tool art-drill">
          <Zap size={96} strokeWidth={1.2} />
          <span>MAKE SOMETHING</span>
        </div>
        <div className="art-tool art-plant">
          <Flower2 size={100} strokeWidth={1.15} />
          <span>GROW SOMETHING</span>
        </div>
        <div className="art-tool art-camp">
          <Tent size={95} strokeWidth={1.15} />
          <span>GO SOMEWHERE</span>
        </div>
        <div className="art-sticker">
          <Handshake size={29} />
          <span>
            OWN LESS.
            <br />
            DO MORE.
          </span>
        </div>
        <span className="art-spark">✳</span>
      </div>
    </section>
  );
}
// Time-dependent queries carry a day key so Convex's query cache advances at UTC midnight.
function useDay() {
  const [day, setDay] = useState(today);
  useEffect(() => {
    const timer = setInterval(() => setDay(today()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return day;
}
function Connected() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const day = useDay();
  const publicTools = useQuery(api.tools.publicList, { day });
  if (isAuthenticated) return <Member />;
  return (
    <Frame
      account={
        isLoading ? (
          <span className="muted">Connecting…</span>
        ) : (
          <Login className="button plain">
            Sign in <ArrowUpRight size={15} />
          </Login>
        )
      }
    >
      <Hero />
      <section className="how-strip">
        <span>
          <span className="step">01</span> Find something useful
        </span>
        <ArrowRight size={16} />
        <span>
          <span className="step">02</span> Borrow from a neighbor
        </span>
        <ArrowRight size={16} />
        <span>
          <span className="step">03</span> Bring it back. Pass it on.
        </span>
      </section>
      <section id="tool-library" className="content">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A SHARED SHED, WITHOUT THE SHED</span>
            <h2>Small loans. Endless possibilities.</h2>
            <p>A peek at what’s available in the neighborhood.</p>
          </div>
          <span className="count-label">
            {publicTools
              ? `${publicTools.length} tools to discover`
              : "Finding tools…"}
          </span>
        </div>
        {publicTools === undefined ? (
          <Loading />
        ) : publicTools.length === 0 ? (
          <Empty
            title="The shelf is ready for its first tool."
            detail="Sign in to lend something useful to a neighbor."
          />
        ) : (
          <div className="tool-grid">
            {publicTools.map((tool, index) => (
              <article
                className="tool-card public-card"
                key={`${tool.name}-${index}`}
              >
                <div
                  className={`tool-art tone-${categories.indexOf(tool.category as Category)}`}
                >
                  <CategoryIcon category={tool.category} size={65} />
                </div>
                <div className="tool-body">
                  <span className="eyebrow">{tool.category}</span>
                  <h3>{tool.name}</h3>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="join-banner">
          <div>
            <h3>Your next project is a sign-in away.</h3>
            <p>
              Meet the neighbors behind the tools. Share a little possibility.
            </p>
          </div>
          <Login>
            Sign in to lend or borrow <ArrowRight size={17} />
          </Login>
        </div>
      </section>
    </Frame>
  );
}
function Member() {
  const ensure = useMutation(api.users.ensure);
  const me = useQuery(api.users.me);
  const [profileError, setProfileError] = useState<string | null>(null);
  useEffect(() => {
    void ensure({}).catch(() =>
      setProfileError(
        "Your profile could not be created. Refresh to try again.",
      ),
    );
  }, [ensure]);
  if (!me)
    return (
      <Frame account={<UserButton />}>
        <div className="content">
          {profileError ? <p role="alert">{profileError}</p> : <Loading />}
        </div>
      </Frame>
    );
  return <Dashboard me={me} />;
}
function Dashboard({
  me,
}: {
  me: NonNullable<FunctionReturnType<typeof api.users.me>>;
}) {
  const day = useDay();
  const tools = useQuery(api.tools.list, { day });
  const loans = useQuery(api.loans.list, { day });
  const neighbors = useQuery(api.users.list, me.role === "admin" ? {} : "skip");
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const request = useMutation(api.loans.request);
  const transition = useMutation(api.loans.transition);
  const retry = useMutation(api.automation.retry);
  const trust = useMutation(api.users.trust);
  const [view, setView] = useState<View>("browse");
  const [category, setCategory] = useState("All tools");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<
    | { type: "list"; tool?: Tool }
    | { type: "borrow"; tool: Tool }
    | { type: "delete"; tool: Tool }
    | null
  >(null);
  const [notice, setNotice] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function run(
    work: () => Promise<unknown>,
    success: string,
    close = false,
  ) {
    setBusy(true);
    try {
      await work();
      setNotice({ message: success, error: false });
      if (close) setModal(null);
    } catch (error) {
      setNotice({
        message:
          error instanceof ConvexError
            ? String(error.data)
            : "That didn’t connect. Please try again.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }
  const myRequests = loans?.filter((l) => l.isBorrower) ?? [];
  const incoming = loans?.filter((l) => l.isLender) ?? [];
  const pending = incoming.filter((l) => l.status === "pending").length;
  const displayed = tools?.filter(
    (t) =>
      (view !== "listings" || t.mine) &&
      (category === "All tools" || t.category === category) &&
      `${t.name} ${t.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const titles = {
    browse: "A whole neighborhood of possibility.",
    listings: "Your tools. Someone’s next big idea.",
    requests: "Good things you’ve got on loan.",
    incoming: "A neighbor needs a hand.",
    admin: "Keep the neighborhood in good hands.",
  };
  const tabs: { id: View; label: string; count?: number }[] = [
    { id: "browse", label: "Explore tools" },
    { id: "listings", label: "My listings" },
    { id: "requests", label: "My requests" },
    { id: "incoming", label: "Incoming requests", count: pending },
    ...(me.role === "admin" ? [{ id: "admin" as const, label: "Admin" }] : []),
  ];
  const onTransition = (
    loan: Loan,
    action: "approve" | "decline" | "cancel" | "return",
  ) =>
    run(
      () => transition({ loanId: loan._id, action }),
      action === "return"
        ? "Marked as returned. Thanks for keeping the loop going."
        : "Request updated.",
    );
  return (
    <Frame
      account={
        <>
          <span className="account-name">Hi, {me.name}</span>
          <UserButton />
        </>
      }
    >
      <main className="dashboard">
        <div className="dashboard-intro">
          <div>
            <span className="eyebrow">
              <span className="live-dot" /> YOUR NEIGHBORHOOD TOOL LIBRARY
            </span>
            <h1>
              Make room for <em>more doing.</em>
            </h1>
            <p>That thing you need? Someone nearby probably has it.</p>
          </div>
          <button
            className="button primary"
            onClick={() => setModal({ type: "list" })}
          >
            <Plus size={18} /> Lend a tool
          </button>
        </div>
        <div className="stats">
          <div>
            <span className="stat-icon">
              <Wrench size={19} />
            </span>
            <strong>{tools?.length ?? "—"}</strong>
            <span>tools in the loop</span>
          </div>
          <div>
            <span className="stat-icon">
              <ArrowDownLeft size={19} />
            </span>
            <strong>
              {myRequests.filter((l) => l.status === "approved").length}
            </strong>
            <span>you’re borrowing</span>
          </div>
          <div>
            <span className="stat-icon">
              <ArrowUpRight size={19} />
            </span>
            <strong>
              {incoming.filter((l) => l.status === "approved").length}
            </strong>
            <span>you’re lending</span>
          </div>
          <div>
            <span className="stat-icon">
              <CircleCheck size={19} />
            </span>
            <strong>
              {loans?.filter(
                (l) => (l.isBorrower || l.isLender) && l.status === "returned",
              ).length ?? "—"}
            </strong>
            <span>loops completed</span>
          </div>
        </div>
        <nav className="tabs" aria-label="Tool library views">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={view === tab.id ? "active" : ""}
              onClick={() => {
                setView(tab.id);
                setCategory("All tools");
                setSearch("");
              }}
            >
              {tab.label}
              {!!tab.count && <span className="tab-count">{tab.count}</span>}
            </button>
          ))}
        </nav>
        <section className="library">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {view === "browse"
                  ? "GOOD TOOLS. GREAT NEIGHBORS."
                  : "KEEP THE LOOP GOING"}
              </span>
              <h2>{titles[view]}</h2>
            </div>
            {(view === "browse" || view === "listings") && (
              <label className="search">
                <Search size={18} />
                <input
                  type="search"
                  aria-label="Search tools"
                  placeholder="Find something useful…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            )}
          </div>
          {(view === "browse" || view === "listings") && (
            <>
              <div className="filters" aria-label="Filter tools by category">
                {["All tools", ...categories].map((c) => (
                  <button
                    key={c}
                    className={category === c ? "selected" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c !== "All tools" && (
                      <CategoryIcon category={c} size={15} />
                    )}
                    {c}
                  </button>
                ))}
              </div>
              {displayed === undefined ? (
                <Loading />
              ) : displayed.length === 0 ? (
                <Empty
                  title={
                    view === "listings"
                      ? "A useful thing deserves another adventure."
                      : "No tools here just yet."
                  }
                  detail={
                    search || category !== "All tools"
                      ? "Try a different search or category."
                      : "List a tool to get your neighborhood started."
                  }
                />
              ) : (
                <div className="tool-grid">
                  {displayed.map((tool) => (
                    <article key={tool._id} className="tool-card">
                      <div
                        className={`tool-art tone-${categories.indexOf(tool.category as Category)}`}
                      >
                        <span
                          className={`availability ${tool.unavailable ? "away" : ""}`}
                        >
                          <span />
                          {tool.unavailable ? "On loan" : "Available"}
                        </span>
                        <CategoryIcon category={tool.category} size={70} />
                        <span className="art-number">
                          SHARE / {tool.category.toUpperCase()}
                        </span>
                      </div>
                      <div className="tool-body">
                        <div className="card-meta">
                          <span>{tool.category}</span>
                          <span>{tool.condition}</span>
                        </div>
                        <h3>{tool.name}</h3>
                        <p className="tool-description">{tool.description}</p>
                        <div className="lender">
                          <span className="avatar">
                            {tool.ownerName.charAt(0).toUpperCase()}
                          </span>
                          <span>
                            {tool.mine ? "Your listing" : tool.ownerName}
                          </span>
                          {tool.trusted && (
                            <span className="trusted" title="Trusted Lender">
                              <ShieldCheck size={15} /> Trusted
                            </span>
                          )}
                        </div>
                        <div className="card-actions">
                          {tool.mine ? (
                            <>
                              <button
                                className="button outline"
                                onClick={() => setModal({ type: "list", tool })}
                              >
                                <Pencil size={14} /> Edit listing
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Remove ${tool.name}`}
                                onClick={() =>
                                  setModal({ type: "delete", tool })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="button outline"
                                onClick={() =>
                                  setModal({ type: "borrow", tool })
                                }
                              >
                                Request to borrow <ArrowUpRight size={15} />
                              </button>
                              {me.role === "admin" && (
                                <button
                                  className="icon-button"
                                  aria-label={`Remove ${tool.name}`}
                                  onClick={() =>
                                    setModal({ type: "delete", tool })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {(view === "requests" || view === "incoming" || view === "admin") &&
            (loans === undefined ? (
              <Loading />
            ) : (
              <>
                <div className="loan-list">
                  {(view === "requests"
                    ? myRequests
                    : view === "incoming"
                      ? incoming
                      : loans
                  ).length === 0 ? (
                    <Empty
                      title="A new loop is just around the corner."
                      detail={
                        view === "incoming"
                          ? "Requests for your tools will appear here."
                          : "Find a tool and send your first request."
                      }
                    />
                  ) : (
                    (view === "requests"
                      ? myRequests
                      : view === "incoming"
                        ? incoming
                        : loans
                    ).map((loan) => (
                      <article className="loan-card" key={loan._id}>
                        <div className="loan-main">
                          <div className="loan-symbol">
                            <Handshake size={25} />
                          </div>
                          <div>
                            <div className="loan-title">
                              <h3>{loan.toolName}</h3>
                              <span
                                className={`badge ${loan.overdue ? "overdue" : loan.status}`}
                              >
                                {loan.overdue ? "Overdue" : loan.status}
                              </span>
                            </div>
                            <p>
                              {loan.isBorrower
                                ? `From ${loan.lenderName}`
                                : loan.isLender
                                  ? `For ${loan.borrowerName}`
                                  : `${loan.lenderName} → ${loan.borrowerName}`}
                            </p>
                            <div className="loan-dates">
                              <CalendarDays size={14} />
                              {loan.start} <ArrowRight size={12} /> {loan.end}
                              <span>UTC</span>
                            </div>
                          </div>
                        </div>
                        <div className="loan-actions">
                          {loan.status === "pending" && loan.isLender && (
                            <>
                              <button
                                disabled={busy}
                                className="button primary small"
                                onClick={() =>
                                  void onTransition(loan, "approve")
                                }
                              >
                                <Check size={15} /> Approve
                              </button>
                              <button
                                disabled={busy}
                                className="button outline small"
                                onClick={() =>
                                  void onTransition(loan, "decline")
                                }
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {loan.status === "pending" && loan.isBorrower && (
                            <button
                              disabled={busy}
                              className="button outline small"
                              onClick={() => void onTransition(loan, "cancel")}
                            >
                              Cancel request
                            </button>
                          )}
                          {loan.status === "approved" &&
                            loan.start <= today() &&
                            (loan.isBorrower || loan.isLender) && (
                              <button
                                disabled={busy}
                                className="button outline small"
                                onClick={() =>
                                  void onTransition(loan, "return")
                                }
                              >
                                <RotateCcw size={14} /> Mark returned
                              </button>
                            )}
                        </div>
                        {loan.activity.length > 0 && (
                          <details className="activity">
                            <summary>
                              <Clock3 size={13} /> {loan.activity[0].label}
                              <ChevronDown size={14} />
                            </summary>
                            <ul>
                              {loan.activity.map((a) => (
                                <li key={a.id}>
                                  <span>
                                    {a.label}
                                    <time>
                                      {new Date(a.at).toLocaleString()}
                                    </time>
                                  </span>
                                  {a.failed && (
                                    <button
                                      className="text-button"
                                      disabled={busy}
                                      onClick={() =>
                                        void run(
                                          () =>
                                            retry({
                                              eventId: a.id as Id<"events">,
                                            }),
                                          "Notification queued again.",
                                        )
                                      }
                                    >
                                      Retry
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                            <p>
                              Notifications use a logged mock delivery channel.
                            </p>
                          </details>
                        )}
                      </article>
                    ))
                  )}
                </div>
                {view === "admin" && (
                  <section className="neighbors">
                    <h3>Neighbor directory</h3>
                    <p className="muted">
                      Trusted Lender is an admin-assigned community badge.
                    </p>
                    {neighbors?.map((n) => (
                      <div className="neighbor-row" key={n._id}>
                        <span className="avatar">{n.name.charAt(0)}</span>
                        <strong>{n.name}</strong>
                        <span className="badge">{n.role}</span>
                        <button
                          className="button outline small"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                trust({ userId: n._id, trusted: !n.trusted }),
                              "Lender badge updated.",
                            )
                          }
                        >
                          <ShieldCheck size={15} />
                          {n.trusted
                            ? "Remove trust badge"
                            : "Mark Trusted Lender"}
                        </button>
                      </div>
                    ))}
                  </section>
                )}
              </>
            ))}
        </section>
        <div className="community-note">
          <Leaf size={18} />
          <p>
            Every borrowed tool is one less thing to buy.{" "}
            <strong>Thanks for keeping good things in the loop.</strong>
          </p>
        </div>
      </main>
      {notice && (
        <div
          className={`toast ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.error ? <AlertCircle size={18} /> : <CircleCheck size={18} />}
          <span>{notice.message}</span>
          <button
            className="icon-button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal.type === "list"
              ? modal.tool
                ? "Give your listing a little refresh."
                : "Put something good in the loop."
              : modal.type === "borrow"
                ? `Borrow ${modal.tool.name}`
                : "Remove this listing?"
          }
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          {modal.type === "list" ? (
            <ListingForm
              tool={modal.tool}
              busy={busy}
              submit={(values) =>
                void run(
                  () =>
                    modal.tool
                      ? update({ toolId: modal.tool._id, ...values })
                      : create(values),
                  "Your listing is in the loop.",
                  true,
                )
              }
            />
          ) : modal.type === "borrow" ? (
            <BorrowForm
              tool={modal.tool}
              busy={busy}
              submit={(start, end) =>
                void run(
                  () => request({ toolId: modal.tool._id, start, end }),
                  "Request sent. Your neighbor will take it from here.",
                  true,
                )
              }
            />
          ) : (
            <>
              <p>
                The listing will leave the library. Pending requests will be
                cancelled.{" "}
                {me.role === "admin"
                  ? "Any approved loans stay visible and returnable."
                  : "Return all approved loans first."}
              </p>
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => remove({ toolId: modal.tool._id }),
                    "Listing removed.",
                    true,
                  )
                }
              >
                {busy ? "Removing…" : "Remove listing"}
              </button>
            </>
          )}
        </Modal>
      )}
    </Frame>
  );
}
function ListingForm({
  tool,
  busy,
  submit,
}: {
  tool?: Tool;
  busy: boolean;
  submit: (data: {
    name: string;
    category: Category;
    condition: Condition;
    description: string;
  }) => void;
}) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submit({
      name: String(data.get("name")),
      category: data.get("category") as Category,
      condition: data.get("condition") as Condition,
      description: String(data.get("description")),
    });
  }
  return (
    <form onSubmit={onSubmit} className="form">
      <p className="muted">
        A useful thing in your cupboard could make someone’s day.
      </p>
      <label>
        Tool name
        <input
          name="name"
          placeholder="e.g. Cordless drill"
          defaultValue={tool?.name}
          required
          maxLength={80}
        />
      </label>
      <div className="form-row">
        <label>
          Category
          <select
            name="category"
            defaultValue={tool?.category ?? categories[0]}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Condition
          <select name="condition" defaultValue={tool?.condition ?? "Good"}>
            {conditions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        A little about it
        <textarea
          name="description"
          placeholder="What should your neighbor know? Include accessories or any quirks."
          defaultValue={tool?.description}
          required
          maxLength={500}
          rows={4}
        />
      </label>
      <button className="button primary" disabled={busy} type="submit">
        {busy ? "Saving…" : tool ? "Save changes" : "Lend this tool"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
function BorrowForm({
  tool,
  busy,
  submit,
}: {
  tool: Tool;
  busy: boolean;
  submit: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState(today());
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        submit(String(data.get("start")), String(data.get("end")));
      }}
    >
      <p className="muted">
        Choose your dates. {tool.ownerName} will approve or decline your
        request.
      </p>
      <div className="form-row">
        <label>
          Borrow from
          <input
            required
            type="date"
            name="start"
            min={today()}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Return by
          <input
            required
            type="date"
            name="end"
            min={start}
            defaultValue={today()}
          />
        </label>
      </div>
      <p className="form-hint">
        Dates are inclusive and use UTC. Loans can last up to 30 days. Return
        your tool by the end of the return date.
      </p>
      {tool.bookings.length > 0 && (
        <div className="bookings">
          <strong>Already booked</strong>
          {tool.bookings.map((b, i) => (
            <span key={i}>
              {b.start} → {b.end}
              {b.end < today() ? " · awaiting return" : ""}
            </span>
          ))}
        </div>
      )}
      <button className="button primary" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send borrow request"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-content">
        <button
          className="icon-button modal-close"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
        <span className="eyebrow">A LITTLE SHARING GOES A LONG WAY</span>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
function Loading() {
  return (
    <div className="empty" role="status">
      <span className="loading-dot" />
      <p>Finding good things nearby…</p>
    </div>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Wrench size={26} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
