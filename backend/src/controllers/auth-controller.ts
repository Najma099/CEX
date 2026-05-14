import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { authSchema } from "../types/auth-schema.js";
import { createToken } from "../utils/auth.js";
import { sendValidationError } from "../utils/validation.js";
import { prisma } from "../db.js";

export async function signup(req: Request, res: Response): Promise<void> {
  const parsedBody = authSchema.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error);
    return;
  }

  const { username, password } = parsedBody.data;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    res.status(201).json({
      token: createToken({ userId: user.id }),
      userId: user.id,
      username: user.username,
    });
  } catch(err) {
    console.log(err);
    res.status(409).json({ error: "username already exists" });
  }
}

export async function signin(req: Request, res: Response): Promise<void> {
  const parsedBody = authSchema.safeParse(req.body);
  if(!parsedBody.success) {
    sendValidationError(res, parsedBody.error);
    return;
  }

  const { username, password } = parsedBody.data;
  try {
    const existingUser = await prisma.user.findUnique({
      where: {
        username,
      }
    });

    if(!existingUser) {
      res.status(400).json({
        error: "Username doesnt exits!"
      });
      return;
    }

    const match = await bcrypt.compare(password, existingUser.password);
    if(!match) {
      res.status(401).json({
        error: 'Invalid credentials'
      });
      return;
    }

    res.status(201).json({
      token: createToken({userId:existingUser.id }),
      userId: existingUser.id,
      username: existingUser.username
    });

  } catch(err) {
    console.log(err);
    res.status(500).json({
      error: 'internal server error'
    })
  }
}
