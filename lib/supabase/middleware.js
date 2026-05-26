import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function updateSession(request) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session if it exists. This MUST happen before any other code
  // that uses the supabase client — otherwise the session may go stale.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // List of routes that require a logged-in user.
  // Add more paths here as we build protected pages (e.g. '/prices', '/vendors').
  const protectedPaths = ['/account']

  const isProtectedRoute = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedRoute && !user) {
    // User is not signed in and trying to access a protected route.
    // Redirect them to /login.
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You must return the supabaseResponse object as it is.
  // Modifying its cookies or returning a fresh NextResponse will break
  // the session-refresh flow.
  return supabaseResponse
}