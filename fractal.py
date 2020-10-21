import numpy as np
import matplotlib.pylab as plt
from time import sleep

def main():
    s=np.zeros((3,5)).astype(int)

    s[0,2]=1
    s[1,1:-1]=1
    s[-1,:]=1
    # s[-1,-1]=1
    s[2,2]=3
    s[0,2]=5



    for _ in range(20):
        plt.spy(s)
        plt.show(block=False)
        input('press <ENTER> to continue')
        st=roth(s)
        dimx=s.shape[0]
        dimy=s.shape[1]
        S=np.zeros((dimx+2*dimy,dimy+2*dimx)).astype(int)
        S[dimy:dimy+dimx,dimx:dimx+dimy]=s
        # print(S)
        iy = int(np.where(st==3)[0])
        ix = int(np.where(st==3)[1])
        fy = int(np.where(S==5)[0])
        fx = int(np.where(S==5)[1])
        dx = fx - ix
        dy = fy - iy
        S[dy:dy+dimy,dx:dx+dimx] += st
        # print(S)
        S[np.where(S==8)]=1
        S[np.where(S==4)]=3
        S[np.where(S==6)]=5
        S[np.where(S==2)]=1
        del(s)
        # min(np.where(S>0)[0]):max(np.where(S>0)[0])+1,min(np.where(S>0)[1]):max(np.where(S>0)[1])+1
        
        
        

        s=S[min(np.where(S>0)[0]):max(np.where(S>0)[0])+1,min(np.where(S>0)[1]):max(np.where(S>0)[1])+1]
        # print(s)

        # print(np.where(S==5)[0])
        # break




def roth(m):
    return np.fliplr(np.transpose(m))

def rotah(m):
    return np.flipud(np.transpose(m))

def rotj(m):
    return np.fliplr(np.flipud(m))


if __name__ == "__main__":
    main()