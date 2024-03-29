import NextAuth from "next-auth";
import authConfig from "@/auth.config";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import { getUserById } from "@/data/user";
import { getTwoFactorConfirmationByUserId } from "@/data/two-factor-confirmation";

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  events: {
    async linkAccount({ user }) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    },
  },

  callbacks: {
    // async signIn({ user }) {
    //   // console.log({ user });
    //   const existingUser = user?.id && (await getUserById(user.id));

    //   if (!existingUser || !existingUser.emailVerified) {
    //     return false;
    //   }

    //   return true;
    // },

    async signIn({ user, account }) {
      // console.log(user, account);
      if (account?.provider !== "credentials") return true;

      const existingUser = user?.id && (await getUserById(user.id));

      //prevent signin without verification
      if (!existingUser || !existingUser.emailVerified) return false;

      //2FA verification
      // to check if two factor authentication is enabled
      if (existingUser.isTwoFactorEnabled) {
        const twoFactorConfirmation = await getTwoFactorConfirmationByUserId(
          existingUser.id
        );

        // console.log({ twoFactorConfirmation });

        if (!twoFactorConfirmation) return false;

        //Delete two factor authentication for next sign in
        await db.twoFactorConfirmation.delete({
          where: { id: twoFactorConfirmation.id },
        });
      }

      return true;
    },
    async session({ session, token }) {
      //  console.log({ sessionToken: token, session });
      // console.log(token);
      // if (session.user) {
      //   session.user.customFields = token.customFields;
      // }
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }

      if (token.role && session.user) {
        session.user.role = token.role as UserRole;
      }

      if (session.user) {
        session.user.isTwoFactorEnabled = token.isTwoFactorEnabled as boolean;
      }
      // console.log({ sessionToken: token, session });
      return session;
    },
    async jwt({ token }) {
      // console.log(token);
      // token.customFields = "check";
      //if no user id, token is not valid
      if (!token.sub) {
        return token;
      }

      const existingUser = await getUserById(token.sub);

      if (!existingUser) return token;
      token.role = existingUser.role;
      token.isTwoFactorEnabled = existingUser.isTwoFactorEnabled;

      return token;
    },
  },
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  ...authConfig,
});
