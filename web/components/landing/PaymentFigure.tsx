export default function PaymentFigure() {
  return <figure className="payment-figure" aria-label="10 USDC budget: 3 paid, 4 reserved for a disputed delivery, 3 unused">
    <div className="pf-head"><span>ONE PROTECTED PAYMENT</span><span>STELLAR TESTNET</span></div>
    <div className="pf-total">10.00 <small>USDC</small></div>
    <div className="pf-bar"><i style={{flex:3,background:"#b6e467"}}/><i style={{flex:4,background:"#c8a8e9"}}/><i style={{flex:3,background:"#e9e5dc"}}/></div>
    <dl><div><dt><i style={{background:"#b6e467"}}/>Paid to seller</dt><dd>3.00</dd></div><div><dt><i style={{background:"#c8a8e9"}}/>Reserved · disputed</dt><dd>4.00</dd></div><div><dt><i style={{background:"#e9e5dc"}}/>Unused · reclaimable after expiry</dt><dd>3.00</dd></div></dl>
    <p>Each delivery has its own review. One dispute keeps its reservation while other claims can settle.</p>
  </figure>;
}
