"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { CreditCard, LockKeyhole, ShoppingBag, Truck } from "lucide-react";

const steps = [
  { n: 1, title: "Choose your pack", text: "Pick your favorite flavors from this month's batch.", Icon: ShoppingBag, color: "pink" },
  { n: 2, title: "Pay to reserve", text: "Your order is confirmed only after payment.", Icon: CreditCard, color: "orange" },
  { n: 3, title: "We close production", text: "Once the window closes, we buy ingredients and prep only what was reserved.", Icon: LockKeyhole, color: "mint" },
  { n: 4, title: "We bake and deliver", text: "Your pack is baked fresh and delivered in one scheduled Lima delivery window.", Icon: Truck, color: "purple" },
];

export function HowMonthlyWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 72%", "end 58%"],
  });
  const travelerLeft = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const trailWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 1120]);
  const popScale = useTransform(scrollYProgress, [0, 0.86, 0.94, 1], [0.92, 1, 1.34, 1.04]);
  const popOpacity = useTransform(scrollYProgress, [0.84, 0.94, 1], [0, 0.86, 0]);
  const burstScale = useTransform(scrollYProgress, [0.84, 0.94, 1], [0.35, 1.05, 1.75]);

  return (
    <section id="how-it-works" className="how-section section-pad" ref={sectionRef}>
      <h2>How the monthly batch works</h2>
      <div className="step-line" aria-hidden="true">
        <motion.span className="step-line-progress" style={{ width: trailWidth }} />
        {steps.map(({ n, color }) => (
          <span className={`step-line-dot ${color}`} key={n}>{n}</span>
        ))}
      </div>
      <div className="scroll-bagel-track desktop" aria-hidden="true">
        <motion.span className="step-pop-burst" style={{ opacity: popOpacity, scale: burstScale }} />
        <motion.div
          className="step-rolling-bagel"
          style={{ left: travelerLeft, rotate, scale: popScale }}
        >
          <Image
            src="/images/bagel-everything.png"
            alt=""
            width={220}
            height={220}
            sizes="58px"
            className="step-rolling-bagel-img"
          />
        </motion.div>
      </div>
      <div className="scroll-bagel-track mobile" aria-hidden="true">
        <motion.div
          className="step-rolling-bagel"
          style={{ left: travelerLeft, rotate, scale: popScale }}
        >
          <Image
            src="/images/bagel-everything.png"
            alt=""
            width={220}
            height={220}
            sizes="48px"
            className="step-rolling-bagel-img"
          />
        </motion.div>
      </div>
      <div className="steps-grid">
        {steps.map(({ n, title, text, Icon, color }) => (
          <article className={`step-card ${color}`} key={title}>
            <span className="step-number">{n}</span>
            <div className="step-icon"><Icon size={34} /></div>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
