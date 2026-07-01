import { createProtoReview } from '@ds/proto-review'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(
    createProtoReview({
      supabaseUrl: 'https://qrthwxfszucewlezpqoo.supabase.co',
      supabaseKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFydGh3eGZzenVjZXdsZXpwcW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDMyMzksImV4cCI6MjA5ODQ3OTIzOX0.NsoOjiwIRyRNHPjwSjF9A0Kcq7iWrntb-5RiUfLLUds',
      projectId: 'erp-app',
      // ERP already wires its own toggle into ErpUserMenu's "Review mode" row,
      // so the package's default floating launcher would be redundant here.
      showLauncher: false,
    })
  )
})
