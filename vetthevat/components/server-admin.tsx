"use client";
import Link from "next/link";
export function ServerAdmin(){return <section className="rounded-xl border bg-white p-6"><h2 className="text-xl font-bold">Platform administration</h2><p className="mt-3 text-sm text-slate-600">Use the dedicated administration application. Platform roles and recent authenticator verification are required.</p><Link href="/super-admin" className="mt-5 inline-flex rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white">Open Super Admin</Link></section>;}
